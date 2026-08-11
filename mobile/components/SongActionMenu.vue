<template>
    <div v-if="show" class="more-menu-overlay" @click="handleClose">
        <div class="more-menu" @click.stop>
            <div class="more-menu-item" @click="handleAddToPlaylist">
                <i class="fas fa-plus-circle"></i>
                <span>添加到播放列表</span>
            </div>
            <div class="more-menu-item" @click="handleAddToPlaylistModal">
                <i class="fas fa-list"></i>
                <span>添加到歌单</span>
            </div>
            <div class="more-menu-item" @click="handlePlayNow">
                <i class="fas fa-play"></i>
                <span>立即播放</span>
            </div>
            <div class="more-menu-item" @click="handleDownload">
                <i class="fas fa-download"></i>
                <span>下载歌曲</span>
            </div>
        </div>
    </div>
    
    <DownloadManager
        ref="downloadManager"
        :song="song"
        @download-start="handleDownloadStart"
        @download-complete="handleDownloadComplete"
        @download-fail="handleDownloadFail"
        @quality-select="handleQualitySelect"
        @after-download="handleClose"
    />
    
    <PlaylistSelectModal ref="playlistSelect" :current-song="song" />
</template>

<script setup>
import { ref } from 'vue';
import DownloadManager from './DownloadManager.vue';
import PlaylistSelectModal from './PlaylistSelectModal.vue';

const props = defineProps({
    show: {
        type: Boolean,
        default: false
    },
    song: {
        type: Object,
        default: null
    }
});

const emit = defineEmits(['close', 'add-to-playlist', 'play-now', 'download-start', 'download-complete', 'download-fail', 'quality-select']);

const downloadManager = ref(null);
const playlistSelect = ref(null);

const handleClose = () => {
    emit('close');
};

const handleAddToPlaylist = () => {
    emit('add-to-playlist', props.song);
    handleClose();
};

const handleAddToPlaylistModal = () => {
    if (playlistSelect.value) {
        playlistSelect.value.fetchPlaylists();
    }
    handleClose();
};

const handlePlayNow = () => {
    emit('play-now', props.song);
    handleClose();
};

const handleDownload = () => {
    if (props.song && downloadManager.value) {
        downloadManager.value.startDownloadProcess();
    }
};

const handleDownloadStart = (song, quality) => {
    emit('download-start', song, quality);
};

const handleDownloadComplete = (song, url, quality) => {
    emit('download-complete', song, url, quality);
};

const handleDownloadFail = (song, error) => {
    emit('download-fail', song, error);
    handleClose();
};

const handleQualitySelect = (quality) => {
    emit('quality-select', quality);
};
</script>

<style scoped>
.more-menu-overlay {
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

.more-menu {
    background: white;
    border-radius: 16px;
    padding: 10px;
    min-width: 200px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.more-menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.2s;
    color: #333;
}

.more-menu-item:hover {
    background: rgba(102, 126, 234, 0.1);
}

.more-menu-item i {
    font-size: 18px;
    color: #667eea;
}

.more-menu-item span {
    font-size: 15px;
}
</style>
