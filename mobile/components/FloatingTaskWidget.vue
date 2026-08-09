<template>
    <!-- 悬浮入口按钮（有任务或最近有完成记录时显示） -->
    <transition name="float-fade">
        <div
            v-if="showFloating"
            class="floating-btn"
            :class="{ 'is-downloading': hasTasks, 'is-done': isAllDone }"
            @click="openPanel"
        >
            <div class="floating-icon">
                <i v-if="hasTasks" class="fas fa-spinner fa-spin"></i>
                <i v-else class="fas fa-check-circle"></i>
            </div>
            <div class="floating-text">
                <div class="floating-title">
                    <template v-if="hasTasks">下载任务进行中</template>
                    <template v-else-if="isAllDone">已完成下载任务</template>
                    <template v-else>暂无任务</template>
                </div>
                <div class="floating-sub">
                    <template v-if="hasTasks">
                        还有 {{ remainingCount }} 首，已完成 {{ totalSuccess }} 首
                    </template>
                    <template v-else-if="isAllDone">
                        已经下载 {{ totalSuccess }} 首
                    </template>
                    <template v-else>
                        暂无下载任务
                    </template>
                </div>
                <div v-if="hasTasks" class="floating-progress">
                    <div class="floating-progress-fill" :style="{ width: overallPercent + '%' }"></div>
                </div>
            </div>
            <!-- 下载中不可关闭，完成后可关闭 -->
            <div v-if="isAllDone" class="floating-close" @click.stop="dismissWidget">
                <i class="fas fa-times"></i>
            </div>
            <div class="floating-badge" v-if="hasTasks && remainingCount > 0">{{ remainingCount }}</div>
        </div>
    </transition>

    <!-- 任务列表面板 -->
    <transition name="panel-slide">
        <div v-if="panelOpen" class="task-panel-overlay" @click.self="closePanel">
            <div class="task-panel">
                <div class="panel-header">
                    <h3>
                        <i class="fas fa-tasks"></i>
                        下载任务
                        <span class="panel-sub" v-if="hasTasks">后台运行中，关闭页面不影响</span>
                    </h3>
                    <button class="panel-close" @click="closePanel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="panel-body">
                    <!-- 全局统计 -->
                    <div class="stats-bar">
                        <div class="stat-item stat-pending">
                            <span class="stat-num">{{ pendingCount }}</span>
                            <span class="stat-label">等待中</span>
                        </div>
                        <div class="stat-item stat-active">
                            <span class="stat-num">{{ activeCount }}</span>
                            <span class="stat-label">下载中</span>
                        </div>
                        <div class="stat-item stat-success">
                            <span class="stat-num">{{ totalSuccess }}</span>
                            <span class="stat-label">成功</span>
                        </div>
                        <div class="stat-item stat-failed">
                            <span class="stat-num">{{ totalFailed }}</span>
                            <span class="stat-label">失败</span>
                        </div>
                    </div>

                    <!-- 批次列表 -->
                    <div v-if="batches.length === 0" class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>暂无下载任务</p>
                    </div>

                    <div v-else class="batch-list">
                        <div v-for="batch in batches" :key="batch.batchId" class="batch-card">
                            <div class="batch-head">
                                <div class="batch-info">
                                    <div class="batch-title">
                                        <i class="fas fa-compact-disc"></i>
                                        <template v-if="batch.albumCount > 1">
                                            《{{ batch.firstAlbumName }}》等 {{ batch.albumCount }} 个专辑 {{ batch.total }} 首
                                        </template>
                                        <template v-else>
                                            《{{ batch.firstAlbumName }}》 {{ batch.total }} 首
                                        </template>
                                    </div>
                                    <div class="batch-meta">
                                        <span class="quality-tag">{{ getQualityLabel(batch.quality) }}</span>
                                        <span class="batch-time">{{ formatTime(batch.addedAt) }}</span>
                                    </div>
                                </div>
                                <button
                                    v-if="batch.pending > 0"
                                    class="batch-cancel-btn"
                                    @click="cancelBatch(batch.batchId)"
                                >
                                    取消剩余 {{ batch.pending }}
                                </button>
                            </div>

                            <div class="batch-progress">
                                <div class="batch-progress-bar">
                                    <div
                                        class="batch-progress-fill"
                                        :style="{ width: batchPercent(batch) + '%' }"
                                    ></div>
                                </div>
                                <div class="batch-progress-text">
                                    <span class="bp-success">✓ {{ batch.success }}</span>
                                    <span class="bp-failed" v-if="batch.failed > 0">✗ {{ batch.failed }}</span>
                                    <span class="bp-pending" v-if="batch.pending > 0">⏳ {{ batch.pending }}</span>
                                    <span class="bp-downloading" v-if="batch.downloading > 0">⬇ {{ batch.downloading }}</span>
                                </div>
                            </div>

                            <div v-if="batch.currentSongName && batch.downloading > 0" class="batch-current">
                                <i class="fas fa-download fa-flash"></i>
                                正在下载：{{ batch.currentSongName }}
                            </div>
                        </div>
                    </div>

                    <!-- 最近完成明细 -->
                    <div v-if="recent.length > 0" class="recent-section">
                        <div class="recent-head">
                            <h4>最近完成</h4>
                            <button class="clear-btn" @click="clearHistory">
                                <i class="fas fa-trash-alt"></i> 清空记录
                            </button>
                        </div>
                        <ul class="recent-list">
                            <li
                                v-for="item in recent.slice(0, 30)"
                                :key="item.id"
                                class="recent-item"
                                :class="'status-' + item.status"
                            >
                                <span class="recent-icon">
                                    <i v-if="item.status === 'success'" class="fas fa-check-circle"></i>
                                    <i v-else-if="item.status === 'failed'" class="fas fa-times-circle"></i>
                                    <i v-else class="fas fa-ban"></i>
                                </span>
                                <span class="recent-name">{{ item.song.name }}</span>
                                <span class="recent-artist">{{ item.song.author }}</span>
                                <span class="recent-status">
                                    <template v-if="item.status === 'success'">成功</template>
                                    <template v-else-if="item.status === 'failed'">失败：{{ item.error }}</template>
                                    <template v-else>已取消</template>
                                </span>
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="panel-footer">
                    <button v-if="hasTasks && pendingCount > 0" class="footer-btn cancel-all" @click="cancelAll">
                        <i class="fas fa-stop-circle"></i> 取消全部等待
                    </button>
                    <span v-else class="footer-tip">任务在容器后台运行，关闭页面或飞牛不会中断</span>
                </div>
            </div>
        </div>
    </transition>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { getDownloadQueueStatus, cancelDownloadQueue, clearDownloadHistory } from '../utils/fnos';
import message from '../utils/message';

const POLL_INTERVAL = 3000; // 3 秒轮询一次

const status = ref(null);
const panelOpen = ref(false);
let timer = null;
let consecutiveErrors = 0;

const pendingCount = computed(() => status.value?.pendingCount || 0);
const activeCount = computed(() => status.value?.activeCount || 0);
const totalSuccess = computed(() => status.value?.totalSuccess || 0);
const totalFailed = computed(() => status.value?.totalFailed || 0);
const batches = computed(() => status.value?.batches || []);
const recent = computed(() => status.value?.recent || []);

// 是否还有未完成的任务（等待中 + 下载中）
const hasTasks = computed(() => (pendingCount.value + activeCount.value) > 0);
const remainingCount = computed(() => pendingCount.value + activeCount.value);

// 是否显示悬浮按钮：有未完成任务，或最近 30 分钟内有完成记录
const showFloating = computed(() => {
    if (!status.value) return false;
    if (hasTasks.value) return true;
    // 检查用户是否手动关闭过（关闭后 30 分钟内不再显示已完成状态）
    const dismissedAt = parseInt(localStorage.getItem('KGmusic_widget_dismissed') || '0', 10);
    if (dismissedAt && Date.now() - dismissedAt < 30 * 60 * 1000) return false;
    // 最近有完成记录且在 30 分钟内
    const last = recent.value[0];
    if (last && last.finishedAt) {
        return Date.now() - last.finishedAt < 30 * 60 * 1000;
    }
    return false;
});

// 全部任务是否已完成（无等待、无下载中）
const isAllDone = computed(() => !hasTasks.value && totalSuccess.value > 0);

const overallPercent = computed(() => {
    if (!status.value) return 0;
    const done = totalSuccess.value + totalFailed.value;
    const total = done + pendingCount.value + activeCount.value;
    if (total === 0) return 0;
    return Math.round((done / total) * 100);
});

const getQualityLabel = (q) => {
    if (q === 'flac') return '无损 FLAC';
    if (q === '320') return '320K MP3';
    if (q === '128') return '128K MP3';
    return q || '';
};

const batchPercent = (batch) => {
    if (!batch || batch.total === 0) return 0;
    const done = batch.success + batch.failed + batch.cancelled;
    return Math.round((done / batch.total) * 100);
};

const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
};

const fetchStatus = async () => {
    const data = await getDownloadQueueStatus();
    if (data) {
        status.value = data;
        consecutiveErrors = 0;
    } else {
        consecutiveErrors++;
        // 连续失败 5 次后停止轮询（非飞牛环境）
        if (consecutiveErrors >= 5) {
            stopPolling();
            status.value = null;
        }
    }
};

const startPolling = () => {
    stopPolling();
    fetchStatus();
    timer = setInterval(fetchStatus, POLL_INTERVAL);
};

const stopPolling = () => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

const openPanel = () => {
    panelOpen.value = true;
    fetchStatus();
};

const closePanel = () => {
    panelOpen.value = false;
};

// 关闭悬浮窗（仅在全部完成后可用，通过 localStorage 记住关闭状态）
const dismissWidget = () => {
    localStorage.setItem('KGmusic_widget_dismissed', String(Date.now()));
    // 立即隐藏
    status.value = null;
};

const cancelBatch = async (batchId) => {
    const res = await cancelDownloadQueue({ batchId });
    if (res.success) {
        message.success(`已取消 ${res.cancelled} 个待下载任务`);
    } else {
        message.error(res.msg || '取消失败');
    }
    fetchStatus();
};

const cancelAll = async () => {
    const res = await cancelDownloadQueue({ all: true });
    if (res.success) {
        message.success(`已取消全部 ${res.cancelled} 个待下载任务`);
    } else {
        message.error(res.msg || '取消失败');
    }
    fetchStatus();
};

const clearHistory = async () => {
    const res = await clearDownloadHistory();
    if (res.success) {
        message.success('已清空历史记录');
    } else {
        message.error(res.msg || '清空失败');
    }
    fetchStatus();
};

onMounted(() => {
    startPolling();
    // 页面重新可见时立即刷新（从其他页面/重开飞牛回来）
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) fetchStatus();
    });
});

onBeforeUnmount(() => {
    stopPolling();
});
</script>

<style scoped>
/* 悬浮入口按钮 */
.floating-btn {
    position: fixed;
    right: 16px;
    bottom: 96px;
    z-index: 9998;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    min-width: 200px;
    max-width: 280px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
    border-radius: 36px;
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.45);
    cursor: pointer;
    user-select: none;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    animation: floatIn 0.3s ease-out;
}

.floating-close {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 20px;
    height: 20px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: #fff;
    opacity: 0;
    transition: opacity 0.2s, background 0.2s;
}

.floating-btn:hover .floating-close {
    opacity: 1;
}

.floating-close:hover {
    background: rgba(0, 0, 0, 0.65);
}

.floating-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.55);
}

.floating-btn.is-downloading {
    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    box-shadow: 0 6px 20px rgba(17, 153, 142, 0.45);
}

.floating-btn.is-done {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.45);
}

@keyframes floatIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.floating-icon {
    font-size: 22px;
    line-height: 1;
    flex-shrink: 0;
}

.floating-text {
    flex: 1;
    min-width: 0;
}

.floating-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
}

.floating-sub {
    font-size: 11px;
    opacity: 0.85;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.floating-progress {
    margin-top: 4px;
    height: 3px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    overflow: hidden;
}

.floating-progress-fill {
    height: 100%;
    background: #fff;
    border-radius: 2px;
    transition: width 0.4s ease;
}

.floating-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    background: #ff4d4f;
    color: #fff;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #fff;
}

/* 面板遮罩 */
.task-panel-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
}

.task-panel {
    background: #fff;
    width: 100%;
    max-width: 460px;
    max-height: 85vh;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
}

.panel-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
}

.panel-sub {
    font-size: 11px;
    font-weight: 400;
    opacity: 0.85;
    margin-left: 6px;
}

.panel-close {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: #fff;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}

.panel-close:hover {
    background: rgba(255, 255, 255, 0.35);
}

.panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
}

/* 统计栏 */
.stats-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 16px;
}

.stat-item {
    text-align: center;
    padding: 10px 4px;
    border-radius: 8px;
    background: #f5f7fa;
}

.stat-num {
    display: block;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
}

.stat-label {
    display: block;
    font-size: 11px;
    color: #888;
    margin-top: 2px;
}

.stat-pending .stat-num { color: #faad14; }
.stat-active .stat-num { color: #1890ff; }
.stat-success .stat-num { color: #52c41a; }
.stat-failed .stat-num { color: #ff4d4f; }

/* 空状态 */
.empty-state {
    text-align: center;
    padding: 40px 0;
    color: #bbb;
}

.empty-state i {
    font-size: 40px;
    margin-bottom: 8px;
}

.empty-state p {
    margin: 0;
    font-size: 14px;
}

/* 批次卡片 */
.batch-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
}

.batch-card {
    background: #f8f9fa;
    border-radius: 10px;
    padding: 12px 14px;
    border-left: 3px solid #667eea;
}

.batch-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
}

.batch-info {
    flex: 1;
    min-width: 0;
}

.batch-title {
    font-size: 14px;
    font-weight: 600;
    color: #333;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.batch-count {
    font-size: 12px;
    color: #888;
    font-weight: 400;
}

.batch-meta {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    font-size: 11px;
    color: #999;
}

.quality-tag {
    background: #e6f4ff;
    color: #1890ff;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
}

.batch-cancel-btn {
    flex-shrink: 0;
    background: #fff1f0;
    color: #ff4d4f;
    border: 1px solid #ffccc7;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
}

.batch-cancel-btn:hover {
    background: #ff4d4f;
    color: #fff;
}

.batch-progress {
    margin-top: 4px;
}

.batch-progress-bar {
    height: 6px;
    background: #e8e8e8;
    border-radius: 3px;
    overflow: hidden;
}

.batch-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    border-radius: 3px;
    transition: width 0.4s ease;
}

.batch-progress-text {
    display: flex;
    gap: 10px;
    margin-top: 6px;
    font-size: 11px;
}

.bp-success { color: #52c41a; }
.bp-failed { color: #ff4d4f; }
.bp-pending { color: #faad14; }
.bp-downloading { color: #1890ff; }

.batch-current {
    margin-top: 8px;
    padding: 6px 8px;
    background: #e6f4ff;
    border-radius: 6px;
    font-size: 12px;
    color: #1890ff;
    display: flex;
    align-items: center;
    gap: 6px;
}

.fa-flash {
    animation: flash 1.2s infinite;
}

@keyframes flash {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

/* 最近完成 */
.recent-section {
    margin-top: 8px;
    border-top: 1px solid #eee;
    padding-top: 12px;
}

.recent-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}

.recent-head h4 {
    margin: 0;
    font-size: 13px;
    color: #555;
}

.clear-btn {
    background: none;
    border: none;
    color: #999;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 4px;
}

.clear-btn:hover {
    color: #ff4d4f;
}

.recent-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 240px;
    overflow-y: auto;
}

.recent-item {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    gap: 6px;
    align-items: center;
    padding: 6px 4px;
    border-bottom: 1px solid #f5f5f5;
    font-size: 12px;
}

.recent-icon i { font-size: 13px; }
.status-success .recent-icon { color: #52c41a; }
.status-failed .recent-icon { color: #ff4d4f; }
.status-cancelled .recent-icon { color: #999; }

.recent-name {
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.recent-artist {
    color: #aaa;
    font-size: 11px;
}

.recent-status {
    font-size: 11px;
    color: #999;
    text-align: right;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.status-failed .recent-status { color: #ff4d4f; }

/* 底部 */
.panel-footer {
    padding: 12px 16px;
    border-top: 1px solid #eee;
    display: flex;
    justify-content: center;
    align-items: center;
}

.footer-btn {
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
}

.footer-btn.cancel-all {
    background: #fff1f0;
    color: #ff4d4f;
    border: 1px solid #ffccc7;
}

.footer-btn.cancel-all:hover {
    background: #ff4d4f;
    color: #fff;
}

.footer-tip {
    font-size: 12px;
    color: #999;
}

/* 过渡动画 */
.float-fade-enter-active, .float-fade-leave-active {
    transition: opacity 0.3s, transform 0.3s;
}
.float-fade-enter-from, .float-fade-leave-to {
    opacity: 0;
    transform: translateY(20px);
}

.panel-slide-enter-active, .panel-slide-leave-active {
    transition: opacity 0.25s;
}
.panel-slide-enter-from, .panel-slide-leave-to {
    opacity: 0;
}
.panel-slide-enter-active .task-panel,
.panel-slide-leave-active .task-panel {
    transition: transform 0.25s;
}
.panel-slide-enter-from .task-panel,
.panel-slide-leave-to .task-panel {
    transform: scale(0.95);
}
</style>
