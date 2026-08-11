<template>
    <div class="download-page">
        <div class="page-header">
            <h1>批量下载</h1>
            <p>输入歌手ID，查询并下载该歌手的所有歌曲</p>
        </div>

        <!-- 第一步：查询歌手（含筛选条件） -->
        <div class="config-section">
            <div class="input-group">
                <label>歌手ID</label>
                <div class="input-with-button artist-id-wrapper">
                    <input
                        v-model="artistId"
                        type="text"
                        placeholder="请输入歌手ID（例如：3520）"
                        class="input-field"
                        @keyup.enter="queryArtist"
                        @blur="handleBlurArtistId"
                    />
                    <!-- 歌手名查询结果（紧跟在输入框右侧） -->
                    <div v-if="artistLookupStatus !== 'idle' || artistName" class="artist-lookup-result inline-result">
                        <span v-if="artistLookupStatus === 'loading'" class="lookup-loading">
                            <i class="fas fa-spinner fa-spin"></i> 查询中...
                        </span>
                        <span v-else-if="artistLookupStatus === 'success' && artistName" class="lookup-success">
                            <i class="fas fa-user-check"></i> {{ artistName }}
                        </span>
                        <span v-else-if="artistLookupStatus === 'error'" class="lookup-error">
                            <i class="fas fa-user-times"></i> {{ artistLookupMsg }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- 筛选条件（查询前设置） -->
            <div class="pre-query-filters">
                <div class="filter-group-head">
                    <div class="group-title">
                        <span>发行日期范围</span>
                        <span class="group-tag" v-if="dateFrom || dateTo">已设置</span>
                        <span class="group-tag group-tag-muted" v-else>可选</span>
                    </div>
                </div>

                <div class="date-range-card">
                    <div class="date-slot" :class="{ filled: !!dateFrom }">
                        <div class="date-slot-label">
                            <i class="fas fa-play-circle slot-icon start-icon"></i>
                            <span>起始日期</span>
                        </div>
                        <CustomDatePicker
                            v-model="dateFrom"
                            placeholder="请选择开始日期"
                            :max-date="dateTo"
                        />
                    </div>

                    <div class="date-arrow">
                        <i class="fas fa-arrow-right"></i>
                    </div>

                    <div class="date-slot" :class="{ filled: !!dateTo }">
                        <div class="date-slot-label">
                            <i class="fas fa-flag-checkered slot-icon end-icon"></i>
                            <span>结束日期</span>
                        </div>
                        <CustomDatePicker
                            v-model="dateTo"
                            placeholder="请选择结束日期"
                            :min-date="dateFrom"
                        />
                    </div>
                </div>

                <div class="filter-divider"></div>

                <div class="filter-row checkbox-filter-row">
                    <div class="group-title inline-title">
                        <span>专辑排除规则</span>
                    </div>
                    <div class="simple-check">
                        <input type="checkbox" v-model="excludeConcert" />
                        <span>排除演唱会（名称含"演唱会"的专辑）</span>
                    </div>
                    <div class="simple-check">
                        <input type="checkbox" v-model="excludeLive" />
                        <span>排除 Live 版本（名称含"Live / LIVE"的专辑）</span>
                    </div>
                    <div class="simple-check">
                        <input type="checkbox" v-model="excludeNoCompany" />
                        <span>排除无唱片公司（publish_company 为空的专辑）</span>
                    </div>
                    <div class="simple-check">
                        <input type="checkbox" v-model="excludeDuplicate" />
                        <span>排除重复歌曲（按照歌曲名排重，同一首歌只下载一次，优先保留最新发布专辑中的版本）</span>
                    </div>
                </div>
            </div>

            <!-- 查询专辑按钮（在所有筛选条件下方） -->
            <div class="query-album-btn-wrapper">
                <button
                    @click="queryArtist"
                    :disabled="querying || !artistId"
                    class="btn btn-query btn-query-album"
                >
                    <i class="fas fa-search"></i>
                    {{ querying ? '查询中...' : '查询专辑' }}
                </button>
            </div>

            <!-- 查询进度 -->
            <div v-if="querying" class="query-progress">
                <div class="progress-bar">
                    <div class="progress-fill" :style="{ width: `${queryProgress}%` }"></div>
                </div>
                <p class="progress-text">{{ queryStatus }}</p>
            </div>
        </div>

        <!-- 第二步：专辑列表 -->
        <div v-if="albums.length > 0" class="songs-section">
            <div class="section-header">
                <h2>专辑列表 (共 {{ albums.length }} 个)</h2>
                <div class="selection-actions">
                    <button @click="selectAllAlbums" class="btn-small">
                        <i class="fas fa-check-square"></i> 全选
                    </button>
                    <button @click="deselectAllAlbums" class="btn-small">
                        <i class="fas fa-square"></i> 全不选
                    </button>
                    <span class="selected-count">已选 {{ selectedAlbums.size }} 个专辑</span>
                </div>
            </div>

            <!-- 专辑表格 -->
            <div class="table-container">
                <table class="songs-table">
                    <thead>
                        <tr>
                            <th class="col-checkbox">
                                <input 
                                    type="checkbox" 
                                    :checked="isAllAlbumsSelected" 
                                    @change="toggleAllAlbumsSelect"
                                />
                            </th>
                            <th class="col-index">#</th>
                            <th class="col-name">专辑名</th>
                            <th class="col-date">发布时间</th>
                            <th class="col-count">歌曲数量</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr 
                            v-for="(album, index) in paginatedAlbums" 
                            :key="album.album_id"
                            :class="{ selected: selectedAlbums.has(album.album_id) }"
                            @click="toggleAlbumSelection(album.album_id)"
                        >
                            <td class="col-checkbox" @click.stop>
                                <input 
                                    type="checkbox" 
                                    :checked="selectedAlbums.has(album.album_id)"
                                    @change="toggleAlbumSelection(album.album_id)"
                                />
                            </td>
                            <td class="col-index">{{ (currentPage - 1) * pageSize + index + 1 }}</td>
                            <td class="col-name">
                                <div class="song-name-cell">
                                    <i class="fas fa-compact-disc"></i>
                                    <span>{{ album.album_name || '未知专辑' }}</span>
                                </div>
                            </td>
                            <td class="col-date">
                                <i class="fas fa-calendar-alt"></i>
                                {{ album.publish_date || album.publish_time || '未知' }}
                            </td>
                            <td class="col-count">
                                <span v-if="album.songCount !== undefined && album.songCount !== null">{{ album.songCount }} 首</span>
                                <span v-else class="loading-count"><i class="fas fa-spinner fa-spin"></i> 加载中...</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- 分页控件 -->
            <div class="pagination">
                <button 
                    @click="currentPage = 1" 
                    :disabled="currentPage === 1"
                    class="btn-page"
                >
                    <i class="fas fa-angle-double-left"></i> 首页
                </button>
                <button 
                    @click="currentPage--" 
                    :disabled="currentPage === 1"
                    class="btn-page"
                >
                    <i class="fas fa-angle-left"></i> 上一页
                </button>
                <span class="page-info">
                    第 {{ currentPage }} / {{ totalPages }} 页
                </span>
                <button 
                    @click="currentPage++" 
                    :disabled="currentPage === totalPages"
                    class="btn-page"
                >
                    下一页 <i class="fas fa-angle-right"></i>
                </button>
                <button 
                    @click="currentPage = totalPages" 
                    :disabled="currentPage === totalPages"
                    class="btn-page"
                >
                    末页 <i class="fas fa-angle-double-right"></i>
                </button>
                <div class="page-size-selector">
                    <label>每页显示：</label>
                    <select v-model.number="pageSize" @change="currentPage = 1" class="select-page-size">
                        <option :value="20">20</option>
                        <option :value="50">50</option>
                        <option :value="100">100</option>
                        <option :value="200">200</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- 第三步：下载按钮（使用 BatchDownloadManager 组件） -->
        <div v-if="albums.length > 0 && selectedAlbums.size > 0" class="download-config-section">
            <h3><i class="fas fa-download"></i> 准备下载</h3>
            
            <div v-if="!isDownloadReady" class="loading-songs-hint">
                <i class="fas fa-spinner fa-spin"></i>
                <span>正在加载选中专辑的歌曲信息，请稍候...</span>
            </div>
            
            <template v-else>
                <div class="download-summary">
                    <i class="fas fa-music"></i>
                    <span>
                        已选 <strong>{{ selectedAlbums.size }}</strong> 个专辑，共 <strong>{{ selectedSongList.length }}</strong> 首歌曲
                        <span v-if="excludeDuplicate && duplicateSkippedCount > 0" class="duplicate-hint">
                            （已跳过 <strong>{{ duplicateSkippedCount }}</strong> 首重复歌曲）
                        </span>
                    </span>
                </div>
                
                <div class="config-grid">
                    <!-- PushPlus 推送配置 -->
                    <div class="pushplus-config">
                        <label class="input-label">
                            <i class="fas fa-bell"></i>
                            <span>PushPlus 推送 Token（可选）</span>
                        </label>
                        <input 
                            v-model="pushplusToken" 
                            type="text" 
                            placeholder="输入 PushPlus Token，下载完成后推送通知"
                            class="input-field pushplus-input"
                        />
                        <p class="hint">下载完成后会将日志推送到您的手机</p>
                    </div>
                    
                    <!-- 下载等待延时配置 -->
                    <div class="delay-config">
                        <label class="input-label">
                            <i class="fas fa-clock"></i>
                            <span>下载等待延时（防风控）</span>
                        </label>
                        <div class="delay-inputs">
                            <input 
                                v-model.number="downloadDelayMin" 
                                type="number" 
                                min="0"
                                max="10"
                                step="0.5"
                                placeholder="最小值"
                                class="input-field delay-input"
                            />
                            <span class="delay-separator">-</span>
                            <input 
                                v-model.number="downloadDelayMax" 
                                type="number" 
                                min="0"
                                max="10"
                                step="0.5"
                                placeholder="最大值"
                                class="input-field delay-input"
                            />
                            <span class="delay-unit">秒</span>
                        </div>
                        <p class="hint">每首歌曲下载后随机等待时间，避免触发风控（建议 3-7 秒）</p>
                    </div>
                </div>

                <!-- 使用 BatchDownloadManager 组件 -->
                <BatchDownloadManager 
                    ref="batchDownloadRef"
                    :songs="selectedSongList"
                    :show-trigger-button="true"
                    trigger-text="下载专辑"
                    trigger-icon="fas fa-download"
                    :download-delay-min="downloadDelayMin"
                    :download-delay-max="downloadDelayMax"
                    :batch-artist="artistName"
                    @download-start="handleDownloadStart"
                    @download-complete="handleDownloadComplete"
                    @song-download-success="handleSongDownloadSuccess"
                    @song-download-fail="handleSongDownloadFail"
                    @download-waiting="handleDownloadWaiting"
                />
            </template>
        </div>

        <!-- 日志区域 -->
        <div v-if="logs.length > 0" class="logs-section">
            <h3><i class="fas fa-terminal"></i> 下载日志</h3>
            <div class="logs-container">
                <div v-for="(log, index) in logs.slice(-50)" :key="index" class="log-item" :class="log.type">
                    <i :class="log.icon"></i>
                    <span>{{ log.message }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { get } from '../utils/request';
import { useRoute } from 'vue-router';
import BatchDownloadManager from '../components/BatchDownloadManager.vue';
import CustomDatePicker from '../components/CustomDatePicker.vue';
import { savePushplusToken, getPushplusToken, sendPushNotification, formatDownloadResultForPush } from '../utils/pushplus';
import { 
    isFileSystemAccessSupported,
    pickDownloadDirectory,
    loadCachedDirectory,
    clearCachedDirectory
} from '../utils/fsDownload';

const route = useRoute();

// ===== 下载路径配置 =====
const fsSupported = ref(isFileSystemAccessSupported());
const downloadPath = ref(''); // 当前下载路径名称
const batchDownloadRef = ref(null); // BatchDownloadManager 组件引用

// 加载已缓存的下载路径名称
const loadDownloadPathName = async () => {
    if (!fsSupported.value) return;
    try {
        const cached = await loadCachedDirectory();
        if (cached) {
            downloadPath.value = cached.name;
        }
    } catch (err) {
        console.warn('加载缓存目录失败:', err);
    }
};

// 选择下载路径
const selectDownloadPath = async () => {
    if (!fsSupported.value) {
        addLog('当前浏览器不支持自定义下载路径，请使用 Chrome 或 Edge', 'warning', 'fas fa-exclamation-triangle');
        return;
    }
    try {
        await pickDownloadDirectory();
        // 重新加载路径名称
        await loadDownloadPathName();
        addLog(`已设置下载路径：${downloadPath.value}，将自动创建「歌手/专辑」文件夹`, 'success', 'fas fa-folder-open');
        // 重置 BatchDownloadManager 的内部状态，让它在下次下载时从缓存重新加载新目录
        if (batchDownloadRef.value) {
            batchDownloadRef.value.reloadDirectoryFromCache();
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            addLog(`设置下载路径失败：${err.message}`, 'error', 'fas fa-times-circle');
        }
    }
};

// 清除下载路径
const clearDownloadPath = async () => {
    await clearCachedDirectory();
    downloadPath.value = '';
    if (batchDownloadRef.value) {
        batchDownloadRef.value.resetDownloadDirectory();
    }
    addLog('已清除下载路径，将使用浏览器默认下载路径', 'info', 'fas fa-info-circle');
};

// 状态变量
const artistId = ref('');
const excludeConcert = ref(localStorage.getItem('download_exclude_concert') !== 'false');
const excludeLive = ref(localStorage.getItem('download_exclude_live') !== 'false');
const excludeNoCompany = ref(localStorage.getItem('download_exclude_no_company') !== 'false');
const excludeDuplicate = ref(localStorage.getItem('download_exclude_duplicate') !== 'false');
const dateFrom = ref(localStorage.getItem('download_date_from') || '');
const dateTo = ref(localStorage.getItem('download_date_to') || '');
const querying = ref(false);

// 歌手ID失焦查询
const artistName = ref('');
const artistLookupStatus = ref('idle'); // idle | loading | success | error
const artistLookupMsg = ref('');

// ===== 快捷日期范围（已移除快捷按钮，保留变量） =====

const albums = ref([]);
const selectedAlbums = ref(new Set());
const albumSongMap = ref(new Map());
const logs = ref([]);

// PushPlus 推送配置 - 从 localStorage 加载
const pushplusToken = ref(getPushplusToken());

// 下载等待延时配置 - 从 localStorage 加载，默认 3-7 秒
const downloadDelayMin = ref(parseFloat(localStorage.getItem('download_delay_min')) || 3);
const downloadDelayMax = ref(parseFloat(localStorage.getItem('download_delay_max')) || 7);

// 分页相关
const currentPage = ref(1);
const pageSize = ref(50);

// 查询进度
const queryProgress = ref(0);
const queryStatus = ref('');

// 监听 PushPlus Token 变化，自动保存到 localStorage
watch(pushplusToken, (newValue) => {
    savePushplusToken(newValue);
});

// 监听筛选条件变化，自动保存到 localStorage
watch(excludeConcert, (v) => localStorage.setItem('download_exclude_concert', String(v)));
watch(excludeLive, (v) => localStorage.setItem('download_exclude_live', String(v)));
watch(excludeNoCompany, (v) => localStorage.setItem('download_exclude_no_company', String(v)));
watch(excludeDuplicate, (v) => localStorage.setItem('download_exclude_duplicate', String(v)));
watch(dateFrom, (v) => localStorage.setItem('download_date_from', v || ''));
watch(dateTo, (v) => localStorage.setItem('download_date_to', v || ''));

// 监听下载延时配置变化，自动保存到 localStorage
watch([downloadDelayMin, downloadDelayMax], ([newMin, newMax]) => {
    // 确保最小值不大于最大值
    if (newMin > newMax) {
        downloadDelayMax.value = newMin;
    }
    // 确保值在合理范围内
    const validMin = Math.max(0, Math.min(10, newMin));
    const validMax = Math.max(0, Math.min(10, newMax));
    
    localStorage.setItem('download_delay_min', validMin.toString());
    localStorage.setItem('download_delay_max', validMax.toString());
});

// 跳过的重复歌曲数量（用于日志和提示）
const duplicateSkippedCount = ref(0);
const duplicateSkippedDetails = ref([]);

// 解析专辑日期（用于排序）
const _parseDateForSort = (dateStr) => {
    if (!dateStr) return 0;
    const match = String(dateStr).match(/(\d{4})[-./]?(\d{1,2})?[-./]?(\d{1,2})?/);
    if (!match) return 0;
    const year = parseInt(match[1]) || 0;
    const month = match[2] ? parseInt(match[2]) - 1 : 0;
    const day = match[3] ? parseInt(match[3]) : 1;
    return new Date(year, month, day).getTime() || 0;
};

// 歌曲名归一化（去空格、全小写，用于去重比较）
const _normalizeSongName = (name) => {
    return String(name || '').trim().toLowerCase();
};

// 内部 computed：同时返回歌曲列表和被去重跳过的明细，避免重复计算
// 注意：computed 内不修改其他响应式状态（避免副作用导致额外渲染调度）
const _selectedSongListInternal = computed(() => {
    const songs = [];
    const skippedDetails = [];
    const map = albumSongMap.value;

    // 获取选中的专辑ID列表
    const selectedIds = Array.from(selectedAlbums.value);

    // 预建 album_id -> album 的 Map，sort 比较器内 O(1) 查找
    // （修复全选时 O(n² log n) find 导致主线程阻塞、界面卡死的问题）
    const albumMap = new Map();
    for (const al of albums.value) {
        albumMap.set(String(al.album_id), al);
    }

    // 如果开启排除重复，先按专辑发布时间从新到旧排序（优先保留最新发布专辑中的版本）
    let orderedIds = selectedIds;
    if (excludeDuplicate.value && selectedIds.length > 1) {
        orderedIds = [...selectedIds].sort((a, b) => {
            const albumA = albumMap.get(String(a));
            const albumB = albumMap.get(String(b));
            const dateA = _parseDateForSort(albumA?.publish_date || albumA?.publish_time);
            const dateB = _parseDateForSort(albumB?.publish_date || albumB?.publish_time);
            return dateB - dateA; // 从新到旧
        });
    }

    const seenSongNames = new Set();

    for (const albumId of orderedIds) {
        const key = String(albumId);
        const albumSongs = map.get(key);
        if (!albumSongs) continue;

        const filtered = albumSongs.filter(song => !shouldExclude(song.name, song.albumName));

        if (excludeDuplicate.value) {
            for (const song of filtered) {
                const songNameKey = _normalizeSongName(song.name);
                if (songNameKey && seenSongNames.has(songNameKey)) {
                    // 已存在相同歌曲名的歌曲，跳过
                    skippedDetails.push({
                        name: song.name,
                        album: song.albumName,
                    });
                    continue;
                }
                if (songNameKey) {
                    seenSongNames.add(songNameKey);
                }
                songs.push(song);
            }
        } else {
            songs.push(...filtered);
        }
    }
    return { songs, skippedDetails };
});

// 对外暴露的歌曲列表
const selectedSongList = computed(() => _selectedSongListInternal.value.songs);

// 监听内部计算结果，同步更新重复歌曲统计（避免在 computed 中写副作用）
watch(_selectedSongListInternal, (val) => {
    duplicateSkippedCount.value = val.skippedDetails.length;
    duplicateSkippedDetails.value = val.skippedDetails;
}, { immediate: true });

// 计算当前页的专辑
const paginatedAlbums = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return albums.value.slice(start, end);
});

// 总页数
const totalPages = computed(() => {
    return Math.ceil(albums.value.length / pageSize.value);
});

// 是否所有专辑都已选中
const isAllAlbumsSelected = computed(() => {
    if (albums.value.length === 0) return false;
    return albums.value.every(album => selectedAlbums.value.has(String(album.album_id)));
});

// 选中专辑的歌曲是否都已加载完成
const isDownloadReady = computed(() => {
    for (const albumId of selectedAlbums.value) {
        // 转换为字符串以确保类型匹配
        const key = String(albumId);
        if (!albumSongMap.value.has(key)) return false;
    }
    return selectedAlbums.value.size > 0;
});

// 添加日志
const addLog = (message, type = 'info', icon = 'fas fa-info-circle') => {
    const timestamp = new Date().toLocaleTimeString();
    logs.value.push({
        message: `[${timestamp}] ${message}`,
        type,
        icon
    });
    console.log(message);
};

// 格式化时长
const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '0:00';
    const secs = Number(seconds);
    if (isNaN(secs)) return '0:00';
    
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
};

// 检查是否应该排除（歌曲级别，用于后续下载时二次过滤）
const shouldExclude = (songName, albumName) => {
    const name = (songName || '').toLowerCase();
    const album = (albumName || '').toLowerCase();
    
    if (excludeConcert.value && (name.includes('演唱会') || album.includes('演唱会'))) {
        return true;
    }
    
    if (excludeLive.value && (name.includes('live') || album.includes('live'))) {
        return true;
    }
    
    return false;
};

// 解析专辑发行日期字符串为 Date 对象
const parseAlbumDate = (dateStr) => {
    if (!dateStr) return null;
    const match = String(dateStr).match(/(\d{4})[-./]?(\d{1,2})?[-./]?(\d{1,2})?/);
    if (match) {
        const year = parseInt(match[1]);
        const month = match[2] ? parseInt(match[2]) - 1 : 0;
        const day = match[3] ? parseInt(match[3]) : 1;
        return new Date(year, month, day);
    }
    return null;
};

// 根据查询前设置的筛选条件过滤专辑列表
const filterAlbumsByConditions = (rawAlbums) => {
    return rawAlbums.filter(album => {
        const albumName = (album.album_name || '').toLowerCase();
        
        // 排除演唱会
        if (excludeConcert.value && albumName.includes('演唱会')) {
            return false;
        }
        
        // 排除 Live
        if (excludeLive.value && albumName.includes('live')) {
            return false;
        }

        // 排除无唱片公司
        if (excludeNoCompany.value) {
            const company = album.publish_company || album.publishCompany || '';
            if (!String(company).trim()) {
                return false;
            }
        }
        
        // 发行日期范围过滤
        if (dateFrom.value || dateTo.value) {
            const dateStr = album.publish_date || album.publish_time || '';
            const albumDate = parseAlbumDate(dateStr);
            // 没有日期信息的专辑，如果用户设置了日期范围，则排除
            if (!albumDate) return false;
            
            if (dateFrom.value) {
                const fromDate = new Date(dateFrom.value);
                fromDate.setHours(0, 0, 0, 0);
                if (albumDate < fromDate) return false;
            }
            
            if (dateTo.value) {
                const toDate = new Date(dateTo.value);
                toDate.setHours(23, 59, 59, 999);
                if (albumDate > toDate) return false;
            }
        }
        
        return true;
    });
};

// 歌手ID失焦自动查询歌手名
const handleBlurArtistId = async () => {
    const id = String(artistId.value || '').trim();
    if (!id) {
        artistName.value = '';
        artistLookupStatus.value = 'idle';
        artistLookupMsg.value = '';
        return;
    }

    artistLookupStatus.value = 'loading';
    artistLookupMsg.value = '';
    artistName.value = '';

    try {
        const response = await get('/artist/detail', { id });
        let found = false;
        let name = '';

        if (response && response.status === 1 && response.data) {
            const d = response.data;
            name = d.author_name || d.authorname || d.name || d.artist_name || d.singer_name || '';
            // 也可能嵌套在 data.info 下
            if (!name && d.info && typeof d.info === 'object') {
                name = d.info.author_name || d.info.authorname || d.info.name || d.info.artist_name || '';
            }
            if (name && String(name).trim()) {
                found = true;
            }
        }

        if (found) {
            artistName.value = String(name).trim();
            artistLookupStatus.value = 'success';
            artistLookupMsg.value = '';
        } else {
            artistLookupStatus.value = 'error';
            artistLookupMsg.value = '找不到歌手，请检查歌手ID';
            artistName.value = '';
        }
    } catch (err) {
        console.warn('查询歌手详情失败:', err);
        artistLookupStatus.value = 'error';
        artistLookupMsg.value = '找不到歌手，请检查歌手ID';
        artistName.value = '';
    }
};

// 获取歌手所有专辑
const fetchArtistAlbums = async (id) => {
    const albums = [];
    let page = 1;
    let hasMore = true;
    const MAX_PAGES = 50; // 安全上限：最多50页（5000个专辑）
    
    while (hasMore && page <= MAX_PAGES) {
        try {
            const response = await get('/artist/albums', {
                id,
                page,
                pagesize: 100
            });
            
            if (response.status === 1 && response.data) {
                const albumList = Array.isArray(response.data) ? response.data : (response.data.info || []);
                albums.push(...albumList);
                
                const total = response.extra?.page_total || response.data?.total || 0;
                const ALBUM_PAGE_SIZE = 100;
                // 用「返回数量 < pagesize」判断最后一页，不依赖可能缺失的 total 字段
                if (albumList.length < ALBUM_PAGE_SIZE || albums.length >= total || albumList.length === 0) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                hasMore = false;
            }
        } catch (error) {
            addLog(`获取专辑失败: ${error.message}`, 'error', 'fas fa-exclamation-circle');
            console.error('获取专辑失败:', error);
            hasMore = false;
        }
    }
    
    return albums;
};

// 获取专辑中的所有歌曲
const fetchAlbumSongs = async (albumId, albumName, publishDate) => {
    const allSongs = [];
    let page = 1;
    let hasMore = true;
    const MAX_PAGES = 50; // 安全上限：最多50页（2500首歌曲）
    
    while (hasMore && page <= MAX_PAGES) {
        try {
            const response = await get('/album/songs', {
                id: albumId,
                page,
                pagesize: 50
            });
            
            if (response.status === 1) {
                const songList = response.data?.songs || [];
                
                if (songList.length > 0) {
                    const formattedSongs = songList
                        .filter(track => track.audio_info?.hash)
                        .map(track => {
                            const audioInfo = track.audio_info;
                            const base = track.base;
                            const albumInfo = track.album_info;
                            
                            let coverUrl = '';
                            if (track.trans_param?.union_cover) {
                                coverUrl = track.trans_param.union_cover.replace('{size}', '480');
                            } else if (albumInfo?.sizable_cover) {
                                coverUrl = albumInfo.sizable_cover.replace('{size}', '480');
                            } else if (base?.sizable_cover) {
                                coverUrl = base.sizable_cover.replace('{size}', '480');
                            }
                            
                            return {
                                hash: audioInfo.hash || '',
                                name: base.audio_name || track.audio_name || '未知歌曲',
                                songname: base.audio_name || '',
                                audio_name: base.audio_name || '',
                                album_id: String(albumId),
                                albumId: albumId,
                                albumName: albumName || albumInfo?.album_name || '未知专辑',
                                album_name: albumName || albumInfo?.album_name || '未知专辑',
                                publish_date: publishDate || albumInfo?.publish_date || '',
                                duration: audioInfo.duration || 0,
                                timelen: audioInfo.duration || 0,
                                cover: coverUrl,
                                img: coverUrl,
                                author: base.author_name || '',
                                singer_name: base.author_name || '',
                                album: albumInfo?.album_name || ''
                            };
                        });
                    
                    allSongs.push(...formattedSongs);
                    
                    // 分页终止：用「返回数量 < pagesize」判断最后一页，不依赖可能缺失的 total 字段
                    const total = response.data?.total || 0;
                    const PAGE_SIZE = 50;
                    if (songList.length < PAGE_SIZE || allSongs.length >= total || songList.length === 0) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }
            } else {
                addLog(`专辑 ${albumName} 返回状态异常: ${response.status}`, 'warning', 'fas fa-exclamation-triangle');
                hasMore = false;
            }
        } catch (error) {
            addLog(`获取专辑歌曲失败: ${albumName} - ${error.message}`, 'error', 'fas fa-exclamation-circle');
            console.error('获取专辑歌曲失败:', error);
            
            if (error.response?.status === 502) {
                addLog('服务器繁忙，等待8秒后重试...', 'warning', 'fas fa-redo');
                await new Promise(resolve => setTimeout(resolve, 8000));
                
                try {
                    const retryResponse = await get('/album/songs', {
                        id: albumId,
                        page,
                        pagesize: 50
                    });
                    
                    if (retryResponse.status === 1) {
                        const songList = retryResponse.data?.songs || [];
                        if (songList.length > 0) {
                            const formattedSongs = songList
                                .filter(track => track.audio_info?.hash)
                                .map(track => {
                                    const audioInfo = track.audio_info;
                                    const base = track.base;
                                    const albumInfo = track.album_info;
                                    
                                    let coverUrl = '';
                                    if (track.trans_param?.union_cover) {
                                        coverUrl = track.trans_param.union_cover.replace('{size}', '480');
                                    } else if (albumInfo?.sizable_cover) {
                                        coverUrl = albumInfo.sizable_cover.replace('{size}', '480');
                                    }
                                    
                                    return {
                                        hash: audioInfo.hash || '',
                                        name: base.audio_name || track.audio_name || '未知歌曲',
                                        album_id: String(albumId),
                                        albumId: albumId,
                                        albumName: albumName,
                                        album_name: albumName,
                                        publish_date: publishDate || albumInfo?.publish_date || '',
                                        duration: audioInfo.duration || 0,
                                        timelen: audioInfo.duration || 0,
                                        cover: coverUrl,
                                        img: coverUrl,
                                        author: base.author_name || '',
                                        singer_name: base.author_name || '',
                                        album: albumName
                                    };
                                });
                            
                            allSongs.push(...formattedSongs);
                            addLog(`重试成功: ${albumName} (${formattedSongs.length}首)`, 'success', 'fas fa-check');
                        }
                    }
                } catch (retryError) {
                    addLog(`重试也失败: ${albumName} - ${retryError.message}`, 'error', 'fas fa-times');
                }
            }
            
            hasMore = false;
        }
    }
    
    return allSongs;
};

// 查询歌手
const queryArtist = async () => {
    if (!artistId.value) {
        addLog('请输入歌手ID', 'warning', 'fas fa-exclamation-triangle');
        return;
    }

    // 确保歌手名已查询（防止用户未失焦或路由参数未触发查询的情况）
    // 严格使用查询出的歌手名创建一级文件夹，不 fallback 到单曲元数据
    if (!artistName.value) {
        await handleBlurArtistId();
    }

    querying.value = true;
    albums.value = [];
    selectedAlbums.value = new Set();
    albumSongMap.value = new Map();
    logs.value = [];
    queryProgress.value = 0;
    
    addLog(`开始查询歌手 ID: ${artistId.value}`, 'info', 'fas fa-search');
    
    try {
        queryStatus.value = '正在获取专辑列表...';
        addLog('正在获取专辑列表...', 'info', 'fas fa-compact-disc');
        const rawAlbums = await fetchArtistAlbums(artistId.value);
        
        if (rawAlbums.length === 0) {
            addLog('未找到该歌手的专辑', 'warning', 'fas fa-exclamation-triangle');
            queryStatus.value = '查询完成（未找到专辑）';
            queryProgress.value = 100;
            querying.value = false;
            return;
        }
        
        addLog(`找到 ${rawAlbums.length} 个专辑`, 'success', 'fas fa-check-circle');
        
        // 根据查询前设置的筛选条件过滤专辑
        const filteredAlbums = filterAlbumsByConditions(rawAlbums);
        if (filteredAlbums.length < rawAlbums.length) {
            addLog(`筛选后剩余 ${filteredAlbums.length} 个专辑（已排除 ${rawAlbums.length - filteredAlbums.length} 个）`, 'info', 'fas fa-filter');
        }
        
        if (filteredAlbums.length === 0) {
            addLog('筛选后没有符合条件的专辑，请调整筛选条件后重新查询', 'warning', 'fas fa-exclamation-triangle');
            queryStatus.value = '筛选后无结果';
            queryProgress.value = 100;
            querying.value = false;
            return;
        }
        
        // 按发布时间新到旧排序
        filteredAlbums.sort((a, b) => {
            const dateA = a.publish_date || a.publish_time || '';
            const dateB = b.publish_date || b.publish_time || '';
            return String(dateB).localeCompare(String(dateA));
        });
        
        // 初始化专辑数据（设置 songCount 为 undefined，等后台加载后更新）
        // 统一将 album_id 转换为字符串类型，确保后续 Map/Set 查找时类型一致
        albums.value = filteredAlbums.map(a => ({
            ...a,
            album_id: String(a.album_id),
            songCount: undefined
        }));
        
        queryProgress.value = 100;
        queryStatus.value = `专辑列表加载完成，正在获取歌曲信息...`;
        addLog('✅ 专辑列表已显示，后台正在获取歌曲信息...', 'info', 'fas fa-hourglass-half');
        
        // 后台并发加载每个专辑的歌曲
        await loadAlbumSongsInBackground(filteredAlbums);
        
    } catch (error) {
        addLog(`查询失败: ${error.message}`, 'error', 'fas fa-exclamation-circle');
        console.error('查询歌手失败:', error);
        queryStatus.value = '查询失败';
    } finally {
        querying.value = false;
    }
};

// 监听路由参数变化，自动填入歌手ID并获取歌手名（不自动查询专辑，由用户手动点击）
watch(() => route.query.artistId, (newArtistId) => {
    if (newArtistId) {
        artistId.value = String(newArtistId);
        // 自动获取歌手名，确保后续下载时 batchArtist 已填充，避免 fallback 到单曲元数据
        handleBlurArtistId();
    }
}, { immediate: true });

// 页面加载时，加载已缓存的下载路径名称
onMounted(() => {
    loadDownloadPathName();
});

// 后台加载所有专辑的歌曲
const loadAlbumSongsInBackground = async (rawAlbums) => {
    let loadedCount = 0;
    const total = rawAlbums.length;
    const albumsToRemove = []; // 需要从列表中移除的专辑（全部歌曲被过滤）
    
    const updateAlbumSongCount = (albumId, count) => {
        const idx = albums.value.findIndex(a => String(a.album_id) === String(albumId));
        if (idx !== -1) {
            const updated = [...albums.value];
            updated[idx] = { ...updated[idx], songCount: count };
            albums.value = updated;
        }
    };
    
    // 从选中集合中移除专辑
    const removeFromSelected = (albumId) => {
        const key = String(albumId);
        if (selectedAlbums.value.has(key)) {
            const set = new Set(selectedAlbums.value);
            set.delete(key);
            selectedAlbums.value = set;
        }
    };
    
    await parallelLimit(
        rawAlbums.map((album) => async () => {
            const albumSongs = await fetchAlbumSongs(album.album_id, album.album_name, album.publish_date || album.publish_time || '');
            
            // 应用过滤规则（排除Live、演唱会等）
            const filteredSongs = albumSongs.filter(song => !shouldExclude(song.name, song.albumName));
            const removedCount = albumSongs.length - filteredSongs.length;
            
            const albumKey = String(album.album_id);
            
            if (filteredSongs.length === 0) {
                // 过滤后没有有效歌曲：记录该专辑待移除
                albumsToRemove.push(albumKey);
                removeFromSelected(albumKey);
                loadedCount++;
                queryStatus.value = `歌曲信息加载中 (${loadedCount}/${total})`;
                const reason = removedCount > 0 ? `（${removedCount}首被过滤规则排除）` : '（无有效歌曲）';
                addLog(`  ✗ ${album.album_name}: 已隐藏 ${reason}`, 'warning', 'fas fa-filter');
                return;
            }
            
            // 存储过滤后的歌曲
            const map = new Map(albumSongMap.value);
            map.set(albumKey, filteredSongs);
            albumSongMap.value = map;
            
            // 更新显示为过滤后的歌曲数量
            updateAlbumSongCount(album.album_id, filteredSongs.length);
            
            loadedCount++;
            queryStatus.value = `歌曲信息加载中 (${loadedCount}/${total})`;
            
            if (removedCount > 0) {
                addLog(`  ✓ ${album.album_name}: ${filteredSongs.length} 首（已过滤${removedCount}首）`, 'success', 'fas fa-check');
            } else {
                addLog(`  ✓ ${album.album_name}: ${filteredSongs.length} 首`, 'success', 'fas fa-check');
            }
        }),
        5
    );
    
    // 全部加载完成后，移除所有有效歌曲为0的专辑
    if (albumsToRemove.length > 0) {
        albums.value = albums.value.filter(a => !albumsToRemove.includes(String(a.album_id)));
        // 同时清理 map 中的数据
        const map = new Map(albumSongMap.value);
        for (const key of albumsToRemove) {
            map.delete(key);
        }
        albumSongMap.value = map;
        addLog(`📋 已隐藏 ${albumsToRemove.length} 个无有效歌曲的专辑`, 'info', 'fas fa-filter');
    }
    
    // 汇总（只算过滤后有效歌曲）
    let totalSongs = 0;
    for (const songs of albumSongMap.value.values()) {
        totalSongs += songs.length;
    }
    queryStatus.value = `加载完成，共 ${totalSongs} 首歌曲`;
    addLog(`✅ 全部加载完成，共 ${albums.value.length} 个专辑 / ${totalSongs} 首歌曲`, 'success', 'fas fa-check-circle');
};

// 并发限制函数
const parallelLimit = async (tasks, limit) => {
    const results = [];
    const executing = [];
    for (const [i, task] of tasks.entries()) {
        const p = Promise.resolve().then(() => task(i));
        results.push(p);
        if (limit <= tasks.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(results);
};

// 切换专辑选择
const toggleAlbumSelection = (albumId) => {
    const key = String(albumId);
    const set = new Set(selectedAlbums.value);
    if (set.has(key)) {
        set.delete(key);
    } else {
        set.add(key);
    }
    selectedAlbums.value = set;
};

// 全选专辑
const selectAllAlbums = () => {
    const set = new Set();
    albums.value.forEach(album => set.add(String(album.album_id)));
    selectedAlbums.value = set;
    addLog(`已全选 ${albums.value.length} 个专辑`, 'info', 'fas fa-check-square');
};

// 全不选
const deselectAllAlbums = () => {
    selectedAlbums.value = new Set();
    addLog('已取消所有选择', 'info', 'fas fa-square');
};

// 切换当前页全选
const toggleAllAlbumsSelect = () => {
    if (isAllAlbumsSelected.value) {
        deselectAllAlbums();
    } else {
        selectAllAlbums();
    }
};

// 等待下一首下载
const handleDownloadWaiting = (delaySec, currentIndex, total) => {
    addLog(`⏳ 等待 ${delaySec} 秒后下载下一首 (${currentIndex}/${total})`, 'info', 'fas fa-hourglass-half');
};

// 单首歌曲下载成功
const handleSongDownloadSuccess = (song, index) => {
    addLog(`[${index}/${selectedSongList.value.length}] ✓ 下载成功: ${song.name}`, 'success', 'fas fa-check-circle');
};

// 单首歌曲下载失败
const handleSongDownloadFail = (song, index, error) => {
    addLog(`[${index}/${selectedSongList.value.length}] ✗ 下载失败: ${song.name} - ${error.message || error}`, 'error', 'fas fa-exclamation-circle');
};

// 下载开始
const handleDownloadStart = () => {
    addLog('开始批量下载...', 'info', 'fas fa-download');
    // 如果有跳过重复歌曲，输出日志（最多显示前5首）
    if (excludeDuplicate.value && duplicateSkippedCount.value > 0) {
        addLog(`🔁 去重规则生效，已跳过 ${duplicateSkippedCount.value} 首重复歌曲（保留最新发布专辑中的版本）`, 'info', 'fas fa-clone');
        if (duplicateSkippedDetails.value.length > 0) {
            const showCount = Math.min(5, duplicateSkippedDetails.value.length);
            for (let i = 0; i < showCount; i++) {
                const item = duplicateSkippedDetails.value[i];
                addLog(`   · 跳过：《${item.name}》(${item.album})`, 'info', 'fas fa-arrow-right');
            }
            if (duplicateSkippedDetails.value.length > showCount) {
                addLog(`   · ... 等 ${duplicateSkippedDetails.value.length - showCount} 首`, 'info', 'fas fa-ellipsis-h');
            }
        }
    }
};

// 下载完成
const handleDownloadComplete = async (result) => {
    const { songs, quality, successList, failedList, totalCount, successCount, failedCount, cancelled, queued, addedCount } = result;

    // 飞牛环境：已加入后台下载队列，任务在服务端持续执行，关闭页面不影响
    if (queued) {
        const dupMsg = (excludeDuplicate.value && duplicateSkippedCount.value > 0) ? `，已跳过重复 ${duplicateSkippedCount.value} 首` : '';
        addLog(`已加入后台下载队列，共 ${addedCount || totalCount} 首歌曲${dupMsg}，关闭页面后任务仍会继续。点击右下角悬浮窗查看进度`, 'success', 'fas fa-list-check');
        return;
    }

    if (cancelled) {
        addLog(`⛔ 下载已取消，已下载 ${successCount} 首，失败 ${failedCount} 首`, 'warning', 'fas fa-exclamation-triangle');
    } else {
        const dupMsg = (excludeDuplicate.value && duplicateSkippedCount.value > 0) ? `，去重跳过 ${duplicateSkippedCount.value} 首` : '';
        addLog(`下载完成！共 ${totalCount} 首歌曲，成功 ${successCount} 首，失败 ${failedCount} 首${dupMsg}，音质: ${quality?.desc || quality?.name || quality}`, 'success', 'fas fa-check-circle');
    }

    // 如果有 PushPlus Token，发送推送
    if (pushplusToken.value) {
        try {
            addLog('正在发送 PushPlus 推送...', 'info', 'fas fa-paper-plane');

            const { title, content } = formatDownloadResultForPush({
                artist: artistName.value,
                albumCount: selectedAlbums.value.size,
                successCount: successCount,
                failedCount: failedCount,
                successList: successList,
                failedList: failedList
            });

            // 使用 Markdown 模板
            const pushResult = await sendPushNotification(pushplusToken.value, title, content, 'markdown');

            if (pushResult.success) {
                addLog('✓ PushPlus 推送成功', 'success', 'fas fa-check-circle');
            } else {
                addLog(`✗ PushPlus 推送失败: ${pushResult.message}`, 'error', 'fas fa-times-circle');
            }
        } catch (error) {
            addLog(`PushPlus 推送异常: ${error.message}`, 'warning', 'fas fa-exclamation-triangle');
            console.error('PushPlus 推送失败:', error);
        }
    }
};
</script>

<style scoped>
.download-page {
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 16px;
    color: white;
}

.page-header {
    text-align: center;
    margin-bottom: 24px;
}

.page-header h1 {
    font-size: 2em;
    margin-bottom: 8px;
}

.page-header p {
    opacity: 0.85;
    font-size: 1em;
}

.config-section, .songs-section, .download-config-section {
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(10px);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.input-group {
    margin-bottom: 20px;
}

.input-group label {
    display: block;
    margin-bottom: 10px;
    font-weight: 600;
    font-size: 1.1em;
}

.input-with-button {
    display: flex;
    gap: 10px;
}

.input-field {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-size: 15px;
    outline: none;
    transition: all 0.2s ease;
}

.input-field::placeholder {
    color: rgba(255, 255, 255, 0.5);
}

.input-field:focus {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.4);
}

.btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn-query {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    white-space: nowrap;
}

.btn-query:hover:not(:disabled) {
    background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%);
}

.query-progress {
    margin-top: 16px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 6px;
}

/* 查询前筛选条件 - 简化为纯布局容器 */
.pre-query-filters {
    margin-top: 16px;
    padding: 16px 0;
}

/* 歌手ID输入框宽度：约原一半，紧凑显示 */
.artist-id-wrapper {
    max-width: 200px;
    min-width: 140px;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
}

/* 歌手名查询结果提示 */
.artist-lookup-result {
    margin-top: 10px;
    font-size: 14px;
    display: flex;
    align-items: center;
}

/* 紧跟在输入框右侧的内联结果 */
.artist-lookup-result.inline-result {
    margin-top: 0;
    white-space: nowrap;
    flex-shrink: 0;
}
.lookup-loading {
    color: rgba(255, 255, 255, 0.75);
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.lookup-success {
    color: #38ef7d;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(56, 239, 125, 0.1);
    border: 1px solid rgba(56, 239, 125, 0.25);
    border-radius: 6px;
}
.lookup-error {
    color: #ff8a8a;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
}

/* 查询专辑按钮容器（全部筛选条件下方） */
.query-album-btn-wrapper {
    margin-top: 8px;
    padding: 10px 0 4px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
}
.btn-query-album {
    padding: 12px 28px;
    font-size: 15px;
}

/* 分组标题 */
.filter-group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;
}

.group-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 1em;
}

.inline-title {
    font-size: 0.95em;
    margin-right: 2px;
}

.group-icon {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(102, 126, 234, 0.3);
    color: #fff;
    border-radius: 4px;
    font-size: 12px;
}

.group-tag {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    background: linear-gradient(135deg, #22c55e, #10b981);
    color: #fff;
    border-radius: 4px;
}

.group-tag-muted {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
}

/* 快捷范围按钮 */
.quick-range-chips {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.chip {
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.75);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.chip:hover {
    background: rgba(102, 126, 234, 0.3);
    border-color: rgba(102, 126, 234, 0.5);
    color: #fff;
    transform: none;
}

.chip-danger {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
}

.chip-danger:hover {
    background: rgba(239, 68, 68, 0.35);
    border-color: rgba(239, 68, 68, 0.5);
    color: #fff;
}

/* 日期选择器 - 简化布局 */
.date-range-card {
    display: flex;
    align-items: stretch;
    gap: 12px;
    padding: 0;
    background: transparent;
    border: none;
}

.date-slot {
    flex: 0 1 auto;
    min-width: 140px;
    max-width: 200px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 0;
    transition: all 0.2s ease;
    position: relative;
}

.date-slot:hover {
    border-color: transparent;
    background: transparent;
    transform: none;
}

.date-slot.filled {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
}

.date-slot-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 6px;
}

.slot-icon {
    font-size: 13px;
}

.start-icon {
    color: #6ee7b7;
}

.end-icon {
    color: #fca5a5;
}

/* date-slot 已有 filled 状态，CustomDatePicker 组件自带触发器样式 */

/* 美化显示的日期（保留用于 date-slot 状态参考） */
.date-display .year {
    font-size: 22px;
    letter-spacing: 0.5px;
    background: linear-gradient(135deg, #c4b5fd, #f0abfc);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
}

.date-display .dash {
    margin: 0 2px;
    opacity: 0.4;
    font-size: 16px;
}

.date-display .md {
    font-size: 14.5px;
    color: rgba(255, 255, 255, 0.85);
}

.date-display.placeholder {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.35);
    padding: 8px 2px 0;
    font-style: italic;
    -webkit-text-fill-color: rgba(255, 255, 255, 0.35);
}

/* 中间箭头 - 简化 */
.date-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 2px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 16px;
}

/* 分隔线 */
.filter-divider {
    height: 1px;
    margin: 16px 0 14px;
    background: rgba(255, 255, 255, 0.12);
    border: none;
}

/* 排除规则 - 简化为行内样式 */
.filter-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
}

.checkbox-filter-row {
    gap: 12px;
}

/* 简化的checkbox样式 - 简洁行内 */
.simple-check {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 14px;
}

.simple-check input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: #667eea;
    flex-shrink: 0;
    margin: 0;
}

.simple-check span {
    color: rgba(255, 255, 255, 0.85);
}

/* ====== 移动端适配 ====== */
@media (max-width: 680px) {
    .pre-query-filters {
        padding: 12px 0;
    }
    .artist-id-wrapper {
        max-width: none;
        min-width: 0;
        width: 100%;
        flex-wrap: wrap;
    }
    .artist-lookup-result.inline-result {
        margin-top: 6px;
        width: 100%;
    }
    .query-album-btn-wrapper {
        justify-content: stretch;
    }
    .query-album-btn-wrapper .btn-query-album {
        width: 100%;
        justify-content: center;
    }
    .filter-group-head {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
    }
    .date-range-card {
        flex-direction: column;
        gap: 12px;
    }
    .date-arrow {
        padding: 4px 0;
        transform: rotate(90deg);
    }
    .date-slot {
        min-width: 0;
    }
    .checkbox-filter-row {
        flex-direction: column;
        align-items: stretch;
    }
    .simple-check {
        width: 100%;
    }
}

.progress-bar {
    width: 100%;
    height: 8px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #11998e 0%, #38ef7d 100%);
    transition: width 0.3s ease;
}

.progress-text {
    text-align: center;
    font-size: 0.9em;
    opacity: 0.9;
    margin: 0;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 12px;
}

.section-header h2 {
    margin: 0;
    font-size: 1.25em;
}

.selection-actions {
    display: flex;
    gap: 8px;
    align-items: center;
}

.btn-small {
    padding: 8px 15px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

.btn-small:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.5);
}

.selected-count {
    padding: 8px 15px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    font-weight: 600;
}

.table-container {
    overflow-x: auto;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
}

.songs-table {
    width: 100%;
    border-collapse: collapse;
}

.songs-table thead {
    background: rgba(255, 255, 255, 0.15);
    position: sticky;
    top: 0;
}

.songs-table th {
    padding: 12px 10px;
    text-align: left;
    font-weight: 500;
    font-size: 13px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}

.songs-table td {
    padding: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.songs-table tbody tr {
    cursor: pointer;
    transition: all 0.2s ease;
}

.songs-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.1);
}

.songs-table tbody tr.selected {
    background: rgba(56, 239, 125, 0.15);
}

.col-checkbox {
    width: 40px;
    text-align: center;
}

.col-checkbox input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
}

.col-index {
    width: 60px;
    text-align: center;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
}

.col-name {
    min-width: 200px;
}

.song-name-cell {
    display: flex;
    align-items: center;
    gap: 8px;
}

.song-name-cell i {
    color: rgba(255, 255, 255, 0.5);
}

.col-album {
    min-width: 150px;
    color: rgba(255, 255, 255, 0.8);
}

.col-date {
    min-width: 120px;
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgba(255, 255, 255, 0.8);
}

.col-date i {
    color: rgba(255, 255, 255, 0.5);
}

.col-count {
    min-width: 100px;
    text-align: center;
}

.loading-count {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
}

.col-duration {
    width: 100px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
}

.col-duration i {
    color: rgba(255, 255, 255, 0.5);
}

.pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    flex-wrap: wrap;
}

.btn-page {
    padding: 8px 15px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    cursor: pointer;
    transition: all 0.3s ease;
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

.btn-page:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
}

.btn-page:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.page-info {
    padding: 8px 15px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    font-weight: 600;
}

.page-size-selector {
    display: flex;
    align-items: center;
    gap: 8px;
}

.select-page-size {
    padding: 6px 10px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.15);
    color: white;
    cursor: pointer;
}

.download-config-section h3 {
    margin-top: 0;
    margin-bottom: 16px;
    font-size: 1.2em;
    display: flex;
    align-items: center;
    gap: 8px;
}

.loading-songs-hint {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
}

.loading-songs-hint i {
    font-size: 20px;
    color: #667eea;
}

.download-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: rgba(56, 239, 125, 0.08);
    border: 1px solid rgba(56, 239, 125, 0.25);
    border-radius: 6px;
    margin-bottom: 16px;
    font-size: 14px;
    color: #38ef7d;
}

.download-summary i {
    font-size: 18px;
}

.download-summary strong {
    font-weight: 700;
}

.duplicate-hint {
    font-size: 12px;
    opacity: 0.85;
    margin-left: 4px;
    color: #fbbf24;
}

.duplicate-hint strong {
    color: #fbbf24;
    font-weight: 700;
}

.config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
    margin-bottom: 16px;
}

.filter-options {
    background: rgba(255, 255, 255, 0.04);
    padding: 12px;
    border-radius: 6px;
}

.pushplus-config {
    background: rgba(255, 255, 255, 0.04);
    padding: 12px;
    border-radius: 6px;
}

/* 下载路径配置 */
.download-path-config {
    background: rgba(255, 255, 255, 0.04);
    padding: 12px;
    border-radius: 6px;
}

.path-control {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
}

.path-display {
    flex: 1;
    min-width: 180px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(167, 139, 250, 0.15);
    border: 1px solid rgba(167, 139, 250, 0.3);
    border-radius: 6px;
    font-size: 13px;
    color: #fff;
}

.path-display.empty {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.6);
}

.path-display i {
    font-size: 14px;
    color: #a7b5fd;
}

.path-display.empty i {
    color: rgba(255, 255, 255, 0.4);
}

.path-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.path-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 8px 14px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
}

.path-btn.select {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.path-btn.select:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.path-btn.clear {
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.3);
}

.path-btn.clear:hover {
    background: rgba(239, 68, 68, 0.3);
}

.hint.warning {
    color: #fbbf24;
}

.delay-config {
    background: rgba(255, 255, 255, 0.04);
    padding: 12px;
    border-radius: 6px;
}

.delay-inputs {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
}

.delay-input {
    width: 80px;
    text-align: center;
}

.delay-separator {
    font-size: 18px;
    font-weight: bold;
    color: rgba(255, 255, 255, 0.6);
}

.delay-unit {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
}

.input-label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-weight: 600;
    font-size: 0.95em;
}

.input-label i {
    color: rgba(255, 255, 255, 0.7);
}

.pushplus-input {
    width: 100%;
    margin-bottom: 8px;
}

.checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-right: 15px;
    margin-bottom: 10px;
    cursor: pointer;
    user-select: none;
}

.checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
}

.hint {
    font-size: 12px;
    opacity: 0.7;
    margin-top: 5px;
    margin-bottom: 0;
}

.logs-section {
    background: rgba(0, 0, 0, 0.25);
    border-radius: 10px;
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
}

.logs-section h3 {
    margin-top: 0;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.logs-container {
    max-height: 300px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    padding: 12px;
}

.log-item {
    padding: 6px 10px;
    margin-bottom: 4px;
    border-radius: 4px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.log-item.success {
    background: rgba(56, 239, 125, 0.1);
    color: #38ef7d;
}

.log-item.error {
    background: rgba(255, 82, 82, 0.1);
    color: #ff5252;
}

.log-item.warning {
    background: rgba(255, 193, 7, 0.1);
    color: #ffc107;
}

.log-item.info {
    color: rgba(255, 255, 255, 0.8);
}

/* 响应式设计 */
@media (max-width: 768px) {
    .page-header h1 {
        font-size: 2em;
    }
    
    .section-header {
        flex-direction: column;
        align-items: flex-start;
    }
    
    .selection-actions {
        width: 100%;
        flex-wrap: wrap;
    }
    
    .config-grid {
        grid-template-columns: 1fr;
    }
    
    .pagination {
        flex-direction: column;
    }
    
    .songs-table {
        font-size: 14px;
    }
    
    .col-date {
        display: none;
    }
    .col-count {
        display: none;
    }
}
</style>
