<template>
    <div v-if="show" class="batch-actions-overlay" @click="handleClose">
        <div class="batch-actions-menu" @click.stop>
            <ul>
                <li @click="handleAppendToQueue">
                    <i class="fas fa-list"></i> 添加到播放列表
                </li>
                <li @click="handleAddToOtherPlaylist" v-if="showAddToPlaylist">
                    <i class="fas fa-folder-plus"></i> 添加到其他歌单
                </li>
                <li @click="handleRemoveFromPlaylist" v-if="showRemoveFromPlaylist">
                    <i class="fas fa-trash-alt"></i> 取消收藏
                </li>
                <li @click="handleBatchDownload">
                    <i class="fas fa-download"></i> 批量下载
                </li>
            </ul>
        </div>
    </div>
</template>

<script setup>
const props = defineProps({
    show: {
        type: Boolean,
        default: false
    },
    showAddToPlaylist: {
        type: Boolean,
        default: true
    },
    showRemoveFromPlaylist: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits([
    'append-to-queue',
    'add-to-other-playlist',
    'remove-from-playlist',
    'batch-download',
    'close'
]);

const handleAppendToQueue = () => {
    emit('append-to-queue');
    handleClose();
};

const handleAddToOtherPlaylist = () => {
    emit('add-to-other-playlist');
    handleClose();
};

const handleRemoveFromPlaylist = () => {
    emit('remove-from-playlist');
    handleClose();
};

const handleBatchDownload = () => {
    emit('batch-download');
    handleClose();
};

const handleClose = () => {
    emit('close');
};
</script>

<style scoped>
.batch-actions-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
}

.batch-actions-menu {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 8px 0;
    min-width: 180px;
}

.batch-actions-menu ul {
    list-style: none;
    padding: 0;
    margin: 0;
}

.batch-actions-menu li {
    padding: 12px 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: background-color 0.2s;
    font-size: 14px;
    color: #333;
}

.batch-actions-menu li:hover {
    background-color: #f5f5f5;
}

.batch-actions-menu li i {
    font-size: 14px;
    color: #667eea;
    width: 20px;
    text-align: center;
}
</style>
