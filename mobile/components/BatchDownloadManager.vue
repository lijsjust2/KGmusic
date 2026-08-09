<template>
    <div class="batch-download-manager">
        <QualityModal
            :show="showQualityModal"
            :song="firstSong"
            :qualities="qualities"
            :cover="getFirstSongCover()"
            :title="modalTitle"
            :description="modalDescription"
            :show-header="true"
            :show-cover="true"
            :show-close-button="true"
            :size="'medium'"
            :disabled-items="[]"
            :selected-item="null"
            @close="handleQualityClose"
            @select="handleQualitySelect"
        />

        <div v-if="isDownloading" class="download-progress">
            <div class="progress-header">
                <h3>批量下载中...</h3>
                <span class="progress-text">{{ currentIndex + 1 }}/{{ songs.length }}</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
            </div>
            <div class="current-song">
                <i class="fas fa-music"></i>
                <span>{{ currentSongName }}</span>
            </div>
            <button class="stop-btn" @click="stopDownload">
                <i class="fas fa-stop-circle"></i> 停止下载
            </button>
        </div>

        <div v-if="showResultModal" class="result-modal-overlay" @click="showResultModal = false">
            <div class="result-modal" @click.stop>
                <div class="result-modal-header">
                    <h3>{{ isCancelled ? '下载已取消' : '下载完成' }}</h3>
                    <button class="close-btn" @click="showResultModal = false">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="result-modal-body">
                    <!-- 汇总信息 -->
                    <div class="result-summary-card">
                        <div class="summary-title">总下载歌曲：{{ totalCount }}首，音质{{ qualityLabel }}</div>
                        <div class="summary-stats">
                            <span class="stat-success">
                                <i class="fas fa-check-circle"></i> 成功下载 {{ downloadResults.success.length }} 首
                            </span>
                            <span class="stat-failed">
                                <i class="fas fa-times-circle"></i> 失败 {{ downloadResults.failed.length }} 首
                            </span>
                        </div>
                    </div>
                    
                    <!-- 成功下载明细（按专辑分组） -->
                    <div v-if="downloadResults.success.length > 0" class="result-section">
                        <h4 class="section-title">成功下载的明细</h4>
                        <div class="album-groups">
                            <div v-for="(group, albumIndex) in groupedSuccessByAlbum" :key="'album-' + albumIndex" class="album-group">
                                <div class="album-name">📀 {{ group.album }}</div>
                                <ol class="song-list">
                                    <li v-for="(songItem, songIdx) in group.songs" :key="'song-' + albumIndex + '-' + songIdx">
                                        {{ songItem.name }}
                                    </li>
                                </ol>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 失败下载明细 -->
                    <div v-if="downloadResults.failed.length > 0" class="result-section failed-section">
                        <h4 class="section-title">失败下载的明细</h4>
                        <ul class="failed-list">
                            <li v-for="(item, index) in downloadResults.failed" :key="'failed-' + index">
                                <span class="song-name">{{ item.name }}</span>
                                <span class="error-msg">{{ item.error }}</span>
                            </li>
                        </ul>
                    </div>
                </div>
                <div class="result-modal-footer">
                    <button class="confirm-btn" @click="showResultModal = false">确定</button>
                </div>
            </div>
        </div>

        <slot name="trigger" :start-download="openQualityModal">
            <button 
                v-if="showTriggerButton" 
                class="download-trigger-btn"
                :disabled="isDownloading"
                @click="openQualityModal"
            >
                <i v-if="isDownloading" class="fas fa-spinner fa-spin"></i>
                <i v-else :class="triggerIcon"></i>
                <span>{{ triggerText }}</span>
            </button>
        </slot>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { get } from '../utils/request';
import { MoeAuthStore } from '../stores/store';
import QualityModal from './QualityModal.vue';
import { downloadWithMetadata } from '../utils/metadata';
import { 
    pickDownloadDirectory, 
    saveBlobToDirectory, 
    isFileSystemAccessSupported,
    loadCachedDirectory,
    cacheDirectory,
    clearCachedDirectory,
    fallbackDownloadBlob
} from '../utils/fsDownload';
import { 
    QUALITY_OPTIONS, 
    QUALITY_FALLBACK_ORDER, 
    getFileExtension,
    getQualityDescription
} from '../utils/qualityConfig';
import { checkFnosEnv, getFnosStatus, downloadToFnos, addToDownloadQueue } from '../utils/fnos';
import { getPushplusToken } from '../utils/pushplus';
import message from '../utils/message';

const sanitizeFileName = (name) => {
    if (!name) return '未知';
    return String(name)
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MoeAuth = MoeAuthStore();

const props = defineProps({
    songs: {
        type: Array,
        required: true,
        default: () => []
    },
    showTriggerButton: {
        type: Boolean,
        default: false
    },
    triggerText: {
        type: String,
        default: '批量下载'
    },
    triggerIcon: {
        type: String,
        default: 'fas fa-download'
    },
    autoStart: {
        type: Boolean,
        default: false
    },
    // 下载等待延时配置（秒）
    downloadDelayMin: {
        type: Number,
        default: 1
    },
    downloadDelayMax: {
        type: Number,
        default: 3
    },
    // 批次级歌手名（用于统一文件夹结构）
    batchArtist: {
        type: String,
        default: ''
    }
});

const emit = defineEmits([
    'download-start',
    'download-complete',
    'download-progress',
    'download-fail',
    'song-download-success',
    'song-download-fail',
    'download-waiting',
    'download-cancelled'
]);

const showQualityModal = ref(false);
const isDownloading = ref(false);
const currentIndex = ref(0);
const currentSongName = ref('');
const selectedQuality = ref(null);
const showResultModal = ref(false);
const isCancelled = ref(false);
const downloadDirHandle = ref(null);
const isPickingDirectory = ref(false);
const useFileSystemAccess = ref(isFileSystemAccessSupported());
// 首次下载完成提示
const hasShownDirTip = ref(localStorage.getItem('download_dir_tip_shown') === 'true');
const downloadResults = ref({
    success: [],
    failed: []
});

const qualities = ref([...QUALITY_OPTIONS]);

const modalTitle = computed(() => '批量下载 - 选择音质');
const modalDescription = computed(() => `共 ${props.songs.length} 首歌曲`);

const firstSong = computed(() => props.songs.length > 0 ? props.songs[0] : null);

const progressPercentage = computed(() => {
    if (props.songs.length === 0) return 0;
    return ((currentIndex.value + 1) / props.songs.length) * 100;
});

// 汇总统计
const totalCount = computed(() => props.songs.length);
const qualityLabel = computed(() => {
    if (selectedQuality.value) {
        const desc = getQualityDescription(selectedQuality.value);
        return desc?.label || selectedQuality.value.quality || '';
    }
    return '';
});

// 按专辑分组成功下载的歌曲
const groupedSuccessByAlbum = computed(() => {
    const groups = {};
    for (const item of downloadResults.value.success) {
        const song = item.song || {};
        const songInfo = song.songInfo || {};
        const album = songInfo.album || song.album || song.album_name || '未知专辑';
        const safeAlbum = album.trim() || '未知专辑';
        
        if (!groups[safeAlbum]) {
            groups[safeAlbum] = {
                album: safeAlbum,
                songs: []
            };
        }
        groups[safeAlbum].songs.push({
            name: item.name,
            song: song
        });
    }
    return Object.values(groups);
});

const stopDownload = () => {
    if (!isDownloading.value) return;
    isDownloading.value = false;
    isCancelled.value = true;
    emit('download-cancelled');
};

const getFirstSongCover = () => {
    if (props.songs.length === 0) return null;
    const song = props.songs[0];
    return song.cover || song.img || song.sizable_cover || song.album_info?.sizable_cover;
};

const openQualityModal = async () => {
    if (props.songs.length === 0) return;
    if (isDownloading.value) {
        console.warn('已有下载任务在进行中，无法打开音质选择');
        return;
    }
    
    if (MoeAuth.isAuthenticated) {
        await MoeAuth.autoClaimVip()
    }
    
    showQualityModal.value = true;
};

const handleQualityClose = () => {
    showQualityModal.value = false;
};

// 清除缓存的下载目录（用于设置页面）
const resetDownloadDirectory = async () => {
    downloadDirHandle.value = null;
    await clearCachedDirectory();
    useFileSystemAccess.value = isFileSystemAccessSupported();
    console.log('[BatchDownload] 下载目录已重置，下次下载需要重新选择');
};

// 重新从缓存加载目录（不清除缓存，用于外部更新了下载路径后同步状态）
const reloadDirectoryFromCache = async () => {
    downloadDirHandle.value = null; // 清除内存中的旧句柄
    useFileSystemAccess.value = isFileSystemAccessSupported();
    // 不清除缓存，下次下载时会自动从缓存加载新目录
    console.log('[BatchDownload] 已重置内部目录状态，下次下载将从缓存重新加载');
};

defineExpose({
    openQualityModal,
    resetDownloadDirectory,
    reloadDirectoryFromCache
});

const handleQualitySelect = async (quality) => {
    showQualityModal.value = false;

    if (isDownloading.value) {
        console.warn('已有下载任务在进行中，跳过重复请求');
        return;
    }
    if (isPickingDirectory.value) {
        console.warn('目录选择对话框已打开，跳过重复请求');
        return;
    }

    selectedQuality.value = quality;

    if (props.songs.length === 0) return;

    // 等待 QualityModal 的 DOM 和过渡动画完全卸载，
    // 避免和 showDirectoryPicker 抢占浏览器 picker 激活态
    await nextTick();
    await sleep(300);

    // 客户端飞牛内嵌模式 + 服务端飞牛容器同时满足：加入后台下载队列（关闭页面/飞牛后继续）
    const fnosStatus = await checkFnosEnv();
    if (fnosStatus.enabled) {
        useFileSystemAccess.value = false;
        console.log('[BatchDownload] 检测到飞牛环境，加入后台下载队列');

        // 短暂展示进度，提示用户已加入队列
        isDownloading.value = true;
        isCancelled.value = false;
        currentIndex.value = 0;
        currentSongName.value = '正在加入下载队列...';
        emit('download-start', props.songs, quality);

        try {
            const pushplusToken = getPushplusToken();
            const result = await addToDownloadQueue(
                props.songs,
                quality,
                props.downloadDelayMin,
                props.downloadDelayMax,
                pushplusToken,
                '',
                props.batchArtist
            );
            if (result.success) {
                const added = result.added || 0;
                const skipped = result.skipped || 0;
                if (skipped > 0) {
                    message.success(`已添加 ${added} 首，跳过 ${skipped} 首（缺少下载信息）`);
                } else {
                    message.success(`已添加到下载列表，共 ${added} 首歌曲`);
                }
                // 通知悬浮任务提醒窗：立即唤醒 + 切回高频刷新
                try {
                    window.dispatchEvent(new CustomEvent('kgmusic:task-added', { detail: { batchId: result.batchId, added: result.added } }));
                } catch (_) { /* 忽略 CustomEvent 兼容问题 */ }
                emit('download-complete', {
                    songs: props.songs,
                    quality: quality,
                    queued: true,
                    batchId: result.batchId,
                    addedCount: result.added,
                    totalCount: props.songs.length,
                    successCount: 0,
                    failedCount: 0,
                    cancelled: false
                });
            } else {
                message.error(result.msg || '加入下载队列失败');
                emit('download-fail', new Error(result.msg || '加入下载队列失败'));
            }
        } catch (e) {
            message.error('加入下载队列异常: ' + (e?.message || ''));
            emit('download-fail', e);
        } finally {
            isDownloading.value = false;
            currentSongName.value = '';
        }
        return;
    }

    // 非飞牛环境：保持原有前端循环下载逻辑（浏览器环境无法后台执行）
    // 尝试使用 File System Access API 创建文件夹结构
    // 策略：优先使用缓存的目录句柄，其次询问用户，最后回退到原生下载
    if (useFileSystemAccess.value) {
        try {
            // 1. 尝试从缓存加载之前保存的目录句柄
            if (!downloadDirHandle.value) {
                const cached = await loadCachedDirectory();
                if (cached) {
                    downloadDirHandle.value = cached;
                    console.log('[BatchDownload] 使用缓存的下载目录:', cached.name);
                }
            }

            // 2. 如果没有缓存，询问用户（只问一次）
            if (!downloadDirHandle.value) {
                isPickingDirectory.value = true;
                console.log('[BatchDownload] 首次使用，请选择下载目录（下次会自动使用）');
                downloadDirHandle.value = await pickDownloadDirectory();
                console.log('[BatchDownload] 已选择下载目录:', downloadDirHandle.value.name);
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                // 用户取消了目录选择 - 回退到原生下载，不中断下载
                console.log('用户取消了目录选择，回退到浏览器原生下载模式');
                downloadDirHandle.value = null;
                useFileSystemAccess.value = false;
            } else if (err.name === 'NotAllowedError' && /already active/i.test(err.message)) {
                // 重试一次
                try {
                    await sleep(800);
                    downloadDirHandle.value = await pickDownloadDirectory();
                } catch (retryErr) {
                    console.warn('重试失败，回退到原生下载:', retryErr);
                    downloadDirHandle.value = null;
                    useFileSystemAccess.value = false;
                }
            } else {
                console.error('目录选择失败，回退到原生下载:', err);
                downloadDirHandle.value = null;
                useFileSystemAccess.value = false;
            }
        } finally {
            isPickingDirectory.value = false;
        }
    }
    
    isDownloading.value = true;
    isCancelled.value = false;
    currentIndex.value = 0;
    
    downloadResults.value = {
        success: [],
        failed: []
    };
    
    // 显示首次使用提示
    if (!hasShownDirTip.value) {
        hasShownDirTip.value = true;
        localStorage.setItem('download_dir_tip_shown', 'true');
    }
    
    emit('download-start', props.songs, quality);
    
    for (let i = 0; i < props.songs.length; i++) {
        if (!isDownloading.value) {
            console.log('下载任务已被中断');
            break;
        }
        
        currentIndex.value = i;
        const song = props.songs[i];
        currentSongName.value = song.name || song.originalData?.name || '未知歌曲';
        
        try {
            await downloadSong(song, quality);
            downloadResults.value.success.push({
                name: currentSongName.value,
                song: song
            });
            emit('song-download-success', song, i + 1);
        } catch (error) {
            console.error(`下载失败: ${currentSongName.value}`, error);
            // 将英文错误信息转换为用户可读的中文
            let errorMsg = error.message || '未知错误';
            if (errorMsg.includes('A requested file or directory could not be found')) {
                errorMsg = '下载目录不存在或已被删除，请重新选择下载目录';
            } else if (errorMsg.includes('NotAllowedError')) {
                errorMsg = '没有写入权限，请选择其他目录';
            } else if (errorMsg.includes('AbortError')) {
                errorMsg = '下载已取消';
            } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
                errorMsg = '网络错误，下载失败';
            }
            downloadResults.value.failed.push({
                name: currentSongName.value,
                song: song,
                error: errorMsg
            });
            emit('song-download-fail', song, i + 1, error);
        }
        
        emit('download-progress', {
            currentIndex: i + 1,
            total: props.songs.length,
            song: song,
            quality: quality
        });
        
        // 如果不是最后一首歌，添加随机延时（防风控）
        if (i < props.songs.length - 1) {
            // 确保延时值在合理范围内
            const rawMin = Math.max(0, Math.min(10, props.downloadDelayMin));
            const rawMax = Math.max(rawMin, Math.min(10, props.downloadDelayMax));
            
            // 生成随机延时（秒）
            const delaySec = Math.floor(Math.random() * (rawMax - rawMin + 1)) + rawMin;
            
            emit('download-waiting', delaySec, i + 1, props.songs.length);
            await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
        }
    }
    
    isDownloading.value = false;
    currentSongName.value = '';
    // 注意：保留 downloadDirHandle.value 不清理，后续下载直接复用用户授权过的目录
    
    if (downloadResults.value.success.length > 0 || downloadResults.value.failed.length > 0) {
        showResultModal.value = true;
    }
    
    // 传递详细的下载结果
    emit('download-complete', {
        songs: props.songs,
        quality: quality,
        successList: downloadResults.value.success,
        failedList: downloadResults.value.failed,
        totalCount: props.songs.length,
        successCount: downloadResults.value.success.length,
        failedCount: downloadResults.value.failed.length,
        cancelled: isCancelled.value
    });
};

const downloadSong = async (song, quality) => {
    const hash = song.hash || song.originalData?.hash;
    if (!hash) {
        throw new Error('歌曲 hash 不存在');
    }
    
    const qualityFallbackOrder = [...QUALITY_FALLBACK_ORDER];
    let currentQualityIndex = qualityFallbackOrder.indexOf(quality.quality);
    if (currentQualityIndex === -1) {
        currentQualityIndex = qualityFallbackOrder.indexOf('320');
        if (currentQualityIndex === -1) currentQualityIndex = 2;
    }
    
    let lastError = null;
    
    while (currentQualityIndex < qualityFallbackOrder.length) {
        const currentQuality = qualityFallbackOrder[currentQualityIndex];
        
        try {
            const data = { hash: hash };
            
            if (!MoeAuth.isAuthenticated) {
                data.free_part = 1;
            }
            
            if (currentQuality !== '128') {
                data.quality = currentQuality;
            }
            
            console.log('[BatchDownload] 请求下载URL:', { quality: currentQuality, hash: hash });
            const response = await get('/song/url', data);
            
            if (response.status !== 1 || !response.url || !response.url[0]) {
                throw new Error(`获取 ${getQualityDescription(currentQuality)} 下载链接失败`);
            }
            
            const downloadUrl = response.url[0];
            const fileExtHint = getFileExtension(currentQuality, downloadUrl);
            
            console.log('[BatchDownload] 下载URL:', downloadUrl, '推测格式:', fileExtHint);
            
            // 客户端飞牛内嵌 + 服务端飞牛容器：通过后端下载到共享目录
            const fnosStatus = getFnosStatus();
            if (fnosStatus.enabled) {
                const songInfo = song.songInfo || {};
                const artist = songInfo.author || song.author || song.singer_name || '未知歌手';
                const album = songInfo.album || song.album || song.album_name || '未知专辑';
                const songName = song.name || song.originalData?.name || '未知歌曲';
                const ext = currentQuality === 'flac' ? 'flac' : 'mp3';
                const fnosFileName = `${songName} - ${artist}.${ext}`;
                
                const fnosResult = await downloadToFnos(downloadUrl, fnosFileName, artist, album, true);
                if (!fnosResult.success) {
                    throw new Error(fnosResult.msg || '飞牛下载失败');
                }
                console.log('[BatchDownload] 飞牛环境已保存:', fnosResult.path);
                return;
            }
            
            const coverUrl = song.cover || song.img || song.sizable_cover || song.album_info?.sizable_cover;
            
            const result = await downloadWithMetadata(song, downloadUrl, { 
                coverUrl,
                hash: hash,
                quality: currentQuality
            });
            
            if (!result.success || !result.outputBlob) {
                throw new Error(result.message || '下载失败');
            }
            
            const songInfo = result.songInfo || {};
            const artist = sanitizeFileName(songInfo.author || song.author || song.singer_name || '未知歌手');
            const album = sanitizeFileName(songInfo.album || song.album || song.album_name || '未知专辑');
            const safeFileName = sanitizeFileName(result.fileName);
            
            // 主流程：File System Access API — 在用户选择的目录下创建 歌手/专辑 子文件夹
            if (useFileSystemAccess.value && downloadDirHandle.value) {
                try {
                    const savedPath = await saveBlobToDirectory(
                        result.outputBlob,
                        downloadDirHandle.value,
                        artist,
                        album,
                        safeFileName
                    );
                    console.log('[BatchDownload] ✓ 文件已保存到:', savedPath);
                    return;
                } catch (fsError) {
                    // 目录句柄失效或目录不存在，回退到原生下载
                    console.warn('[BatchDownload] 文件系统操作失败，回退到原生下载:', fsError.message);
                    if (fsError.message?.includes('not be found') || 
                        fsError.name === 'NotFoundError' ||
                        fsError.name === 'NotAllowedError') {
                        // 清除失效的目录句柄，下次需要重新选择
                        downloadDirHandle.value = null;
                        await clearCachedDirectory();
                        useFileSystemAccess.value = false;
                    }
                }
            }
            
            // 回退：浏览器原生下载（使用浏览器默认下载路径）
            fallbackDownloadBlob(result.outputBlob, artist, album, safeFileName);
            return;
            
        } catch (error) {
            lastError = error;
            console.warn(`[BatchDownload] 歌曲 ${song.name} 尝试 ${getQualityDescription(currentQuality)} 失败:`, error.message);
            currentQualityIndex++;
        }
    }
    
    throw lastError || new Error('所有音质尝试均失败');
};

onMounted(() => {
    if (props.autoStart && props.songs.length > 0) {
        openQualityModal();
    }
})
</script>

<style scoped>
.batch-download-manager {
    position: relative;
}

.download-trigger-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.download-trigger-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.download-trigger-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.download-progress {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    min-width: 320px;
    z-index: 10000;
}

.progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.progress-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #333;
}

.progress-text {
    font-size: 14px;
    color: #667eea;
    font-weight: 500;
}

.progress-bar {
    width: 100%;
    height: 8px;
    background: #f0f0f0;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 16px;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    border-radius: 4px;
    transition: width 0.3s ease;
}

.current-song {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 8px;
}

.current-song i {
    font-size: 16px;
    color: #667eea;
}

.current-song span {
    font-size: 14px;
    color: #555;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.stop-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    margin-top: 16px;
    padding: 10px;
    background: #fff1f0;
    color: #ff4d4f;
    border: 1px solid #ffccc7;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}

.stop-btn:hover {
    background: #ff4d4f;
    color: white;
    border-color: #ff4d4f;
}

.stop-btn i {
    font-size: 16px;
}

.result-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
}

.result-modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    max-width: 480px;
    width: 90%;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
}

.result-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #eee;
}

.result-modal-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #333;
}

.close-btn {
    background: none;
    border: none;
    font-size: 18px;
    color: #999;
    cursor: pointer;
    padding: 4px;
    transition: color 0.2s;
}

.close-btn:hover {
    color: #333;
}

.result-modal-body {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
}

/* 汇总卡片 */
.result-summary-card {
    background: linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%);
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 20px;
}

.summary-title {
    font-size: 15px;
    font-weight: 600;
    color: #333;
    margin-bottom: 10px;
}

.summary-stats {
    display: flex;
    gap: 16px;
}

.stat-success {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #52c41a;
}

.stat-failed {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #ff4d4f;
}

.result-section {
    margin-bottom: 16px;
}

.section-title {
    margin: 0 0 12px 0;
    font-size: 15px;
    font-weight: 600;
    color: #333;
}

/* 专辑分组 */
.album-groups {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.album-group {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 12px 16px;
    border-left: 3px solid #667eea;
}

.album-name {
    font-size: 14px;
    font-weight: 600;
    color: #555;
    margin-bottom: 8px;
}

.song-list {
    list-style: decimal;
    padding-left: 24px;
    margin: 0;
}

.song-list li {
    font-size: 13px;
    color: #666;
    padding: 3px 0;
}

/* 失败列表 */
.failed-section {
    border-top: 1px solid #eee;
    padding-top: 16px;
}

.failed-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.failed-list li {
    display: flex;
    flex-direction: column;
    padding: 10px 12px;
    border-radius: 6px;
    background: #fff2f0;
    margin-bottom: 6px;
}

.song-name {
    font-size: 13px;
    color: #333;
}

.error-msg {
    font-size: 12px;
    color: #999;
    margin-top: 4px;
}

.result-modal-footer {
    padding: 16px 20px;
    border-top: 1px solid #eee;
    display: flex;
    justify-content: flex-end;
}

.confirm-btn {
    padding: 8px 24px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
}

.confirm-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}
</style>
