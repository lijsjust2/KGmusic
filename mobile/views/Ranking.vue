<template>
    <div class="ranking-container">
        <!-- 添加榜单选择区域 -->
        <div class="rank-selector">
            <div 
                v-for="rank in allRanks" 
                :key="rank.rankid"
                class="rank-chip"
                :class="{ active: selectedRankId === rank.rankid }"
                @click="selectRank(rank)"
            >
                {{ rank.rankname }}
            </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="loading-indicator">
            <div class="loading-spinner"></div>
            <span>加载中...</span>
        </div>

        <!-- 错误状态 -->
        <div v-else-if="error" class="error-indicator">
            <span>{{ error }}</span>
        </div>

        <!-- 排行榜详情 -->
        <div v-else-if="selectedRank" class="ranking-detail">
            <div class="rank-container">
                <div class="ranking-header">
                    <div class="rank-cover">
                        <img :src="$getCover(selectedRank.imgurl, 640)">
                    </div>
                    <div class="rank-info">
                        <h1 class="rank-title">{{ selectedRank.rankname }}</h1>
                        <span class="rank-update">{{ formatIntro(selectedRank.intro) }}</span>
                    </div>
                    <div class="rank-actions">
                        <button class="play-all-btn" @click.stop="toggleActionMenu($event)">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
                
                <!-- 操作菜单 -->
                <div v-if="showActionMenu" class="action-menu-overlay" @click="closeActionMenu">
                    <div class="action-menu" :style="{ top: actionMenuPosition.y + 'px', left: actionMenuPosition.x + 'px' }" @click.stop>
                        <div class="action-menu-item" @click="handleAddAllToPlaylist">
                            <i class="fas fa-play-circle"></i>
                            <span>添加到播放列表</span>
                        </div>
                        <div class="action-menu-item" @click="handleAddToFavorites">
                            <i class="fas fa-heart"></i>
                            <span>收藏到歌单</span>
                        </div>
                    </div>
                </div>
                
                <div class="song-list">
                    <div class="song-item" v-for="(song, sIndex) in songList" :key="sIndex" @click="playSong(song)">
                        <div class="song-rank">
                            <span class="song-index" :class="{'top-three': sIndex < 3}">{{ sIndex + 1 }}</span>
                        </div>
                        <div class="song-cover">
                            <img :src="$getCover(song.trans_param.union_cover, 120)">
                            <div class="hover-play">
                                <i class="fas fa-play"></i>
                            </div>
                        </div>
                        <div class="song-info">
                            <div class="song-content">
                                <div class="song-main">
                                    <div class="song-name">{{ song.songname }}</div>
                                    <div class="song-author">{{ song.author_name }}</div>
                                </div>
                                <div class="song-meta">
                                    <span class="album">{{ song.album_name }}</span>
                                    <span class="duration">{{ $formatMilliseconds(song.deprecated.duration) }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="song-actions">
                            <button class="action-btn play-btn" @click.stop="playSong(song)">
                                <i class="fas fa-play"></i>
                            </button>
                            <button class="action-btn more-btn" @click.stop="toggleMoreMenu(song, $event)">
                                <i class="fas fa-ellipsis-h"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div v-if="loadingMore" class="loading-more">
                        <div class="loading-spinner"></div>
                        <span>加载更多...</span>
                    </div>
                    
                    <div v-else-if="!hasMore && songList.length > 0" class="no-more">
                        <span>已加载全部歌曲</span>
                    </div>
                </div>
            </div>
        </div>

        <SongActionMenu
          :show="showMoreMenu"
          :song="currentSong"
          @close="closeMoreMenu"
          @add-to-playlist="handleAddToPlaylist"
          @play-now="handlePlayNow"
          @download-start="handleDownloadStart"
          @download-complete="handleDownloadComplete"
          @download-fail="handleDownloadFail"
          @quality-select="handleQualitySelect"
        />
        
        <PlaylistSelectModal ref="playlistSelectModal" :current-song="savedSongs" />
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, getCurrentInstance } from 'vue';
import { get } from '../utils/request';
import SongActionMenu from '../components/SongActionMenu.vue';
import PlaylistSelectModal from '../components/PlaylistSelectModal.vue';

const { proxy } = getCurrentInstance();

const allRanks = ref([]);
const selectedRankId = ref(null);
const selectedRank = ref(null);
const songList = ref([]);
const pagesize = 30;
const currentPage = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(true);
const error = ref('');

const showMoreMenu = ref(false);
const currentSong = ref(null);
const showActionMenu = ref(false);
const actionMenuPosition = ref({ x: 0, y: 0 });
const savedSongs = ref(null);
const playlistSelectModal = ref(null);

const formatIntro = (intro) => {
    if (!intro) return '';
    const parts = intro.split('\n');
    const sortRule = parts.find(p => p.includes('排序方式：'))?.replace('排序方式：', '').trim() || '';
    const updateFreq = parts.find(p => p.includes('更新频率：'))?.replace('更新频率：', '').trim() || '';
    
    if (sortRule && updateFreq) {
        return `${sortRule} (${updateFreq})`;
    }
    return intro;
};

const loadAllRankSongs = async (rankId) => {
    let allSongs = [];
    let page = 1;
    let hasMore = true;
    
    window.$modal.showLoading('歌单加载中');
    
    try {
        while (hasMore) {
            const songsResponse = await get(`/rank/audio?rankid=${rankId}&page=${page}&pagesize=${pagesize}`);
            if (songsResponse.status === 1) {
                const newSongs = songsResponse.data.songlist || [];
                allSongs = [...allSongs, ...newSongs];
                
                if (newSongs.length < pagesize) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                hasMore = false;
            }
        }
    } catch (err) {
        console.error('加载全部榜单歌曲失败:', err);
        error.value = '加载歌曲失败';
    } finally {
        window.$modal.hideLoading();
    }
    
    return allSongs;
};

const loadRankSongs = async (rankId, page = 1, append = false) => {
    if (loading.value || (loadingMore.value && append)) return;
    
    if (append) {
        loadingMore.value = true;
    } else {
        loading.value = true;
    }
    
    try {
        const songsResponse = await get(`/rank/audio?rankid=${rankId}&page=${page}&pagesize=${pagesize}`);
        if (songsResponse.status === 1) {
            const newSongs = songsResponse.data.songlist || [];
            
            if (append) {
                songList.value = [...songList.value, ...newSongs];
            } else {
                songList.value = newSongs;
            }
            
            if (newSongs.length < pagesize) {
                hasMore.value = false;
            } else {
                hasMore.value = true;
            }
            
            currentPage.value = page;
        }
    } catch (err) {
        console.error('加载榜单歌曲失败:', err);
        error.value = '加载歌曲失败';
    } finally {
        loading.value = false;
        loadingMore.value = false;
    }
};

const selectRank = async (rank) => {
    selectedRankId.value = rank.rankid;
    selectedRank.value = rank;
    songList.value = [];
    currentPage.value = 1;
    hasMore.value = true;
    error.value = '';
    await loadRankSongs(rank.rankid, 1, false);
};

const playSong = (song) => {
    if (window.playerControl && window.playerControl.addSongToQueue) {
        window.playerControl.addSongToQueue(
            song.deprecated.hash, 
            song.songname, 
            proxy.$getCover(song.trans_param.union_cover, 480), 
            song.author_name,
            song.deprecated.duration || 0,
            { album_name: song.album_name, album_id: song.album_id, publish_date: song.publish_date }
        );
    } else {
        console.error('Player control is not available');
    }
};

const playRankSongs = (songs) => {
    if (window.playerControl && songs?.length) {
        const newTracks = songs.map(song => ({ 
            hash: song.deprecated.hash,
            author: song.author_name, 
            name: song.songname,
            cover: song.trans_param.union_cover?.replace("{size}", 120),
            timelen: song.deprecated.duration
        }))
        window.playerControl.addPlaylistToQueue(newTracks);
    }
};

const handleScroll = () => {
    if (!hasMore.value || loadingMore.value) {
        return;
    }
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    
    if (scrollTop + clientHeight >= scrollHeight - 100) {
        const nextPage = currentPage.value + 1;
        loadRankSongs(selectedRankId.value, nextPage, true);
    }
};

const handlePlayClick = async (event) => {
    const allSongs = await loadAllRankSongs(selectedRankId.value);
    
    if (allSongs.length === 0) {
        window.$modal.alert('加载歌曲失败，请重试');
        return;
    }
    
    const confirmed = await window.$modal.confirm(
        `确定要将 ${allSongs.length} 首歌曲添加到播放列表吗？`
    );
    
    if (confirmed) {
        const note = document.createElement('i');
        note.className = 'fas fa-music music-note';
        const x = event.clientX;
        const y = event.clientY;
        note.style.left = x + 'px';
        note.style.top = y + 'px';
        
        document.body.appendChild(note);
        const targetX = window.innerWidth - 300;
        const targetY = window.innerHeight - 100;
        
        const deltaX = targetX - x;
        const deltaY = targetY - y;
        
        requestAnimationFrame(() => {
            note.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            note.style.opacity = '0';
        });
        
        setTimeout(() => {
            document.body.removeChild(note);
        }, 1000);
        
        playRankSongs(allSongs);
    }
};

const toggleActionMenu = (event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    actionMenuPosition.value = {
        x: rect.right - 180,
        y: rect.bottom + 5
    };
    showActionMenu.value = !showActionMenu.value;
    
    if (showActionMenu.value) {
        setTimeout(() => {
            document.addEventListener('click', closeActionMenu);
        }, 0);
    }
};

const closeActionMenu = () => {
    showActionMenu.value = false;
    document.removeEventListener('click', closeActionMenu);
};

const handleAddAllToPlaylist = async () => {
    closeActionMenu();
    const allSongs = await loadAllRankSongs(selectedRankId.value);
    
    if (allSongs.length === 0) {
        window.$modal.alert('加载歌曲失败，请重试');
        return;
    }
    
    const confirmed = await window.$modal.confirm(
        `确定要将 ${allSongs.length} 首歌曲添加到播放列表吗？`
    );
    
    if (confirmed) {
        const newTracks = allSongs.map(song => ({ 
            hash: song.deprecated.hash,
            author: song.author_name, 
            name: song.songname,
            cover: song.trans_param.union_cover?.replace("{size}", 120),
            timelen: song.deprecated.duration
        }));
        
        window.playerControl.addPlaylistToQueue(newTracks);
        
        if (window.musicPlayer && window.musicPlayer.setUserPlaylist) {
            window.musicPlayer.setUserPlaylist(newTracks);
        }
    }
};

const handleAddToFavorites = async () => {
    closeActionMenu();
    const allSongs = await loadAllRankSongs(selectedRankId.value);
    
    if (allSongs.length === 0) {
        window.$modal.alert('加载歌曲失败，请重试');
        return;
    }
    
    savedSongs.value = allSongs.map(song => ({
        name: song.songname,
        hash: song.deprecated.hash
    }));
    
    if (playlistSelectModal.value) {
        playlistSelectModal.value.fetchPlaylists();
    }
};

const toggleMoreMenu = (song, event) => {
    event.stopPropagation();
    currentSong.value = {
        name: song.songname,
        author: song.author_name,
        hash: song.deprecated.hash,
        cover: song.trans_param.union_cover,
        duration: song.deprecated.duration,
        album_name: song.album_name,
        album_id: song.album_id,
        publish_date: song.publish_date
    };
    showMoreMenu.value = true;
    
    setTimeout(() => {
        document.addEventListener('click', closeMoreMenu);
    }, 0);
};

const closeMoreMenu = () => {
    showMoreMenu.value = false;
    currentSong.value = null;
    document.removeEventListener('click', closeMoreMenu);
};

const handleAddToPlaylist = (song) => {
    if (window.playerControl && window.playerControl.addSongToQueue) {
        window.playerControl.addSongToQueue(
            song.deprecated.hash, 
            song.songname, 
            proxy.$getCover(song.trans_param.union_cover, 480), 
            song.author_name,
            song.deprecated.duration || 0
        );
    }
};

const handlePlayNow = (song) => {
    playSong(song);
};

// 下载事件处理
const handleDownloadStart = (song, quality) => {
    console.log('下载开始:', song.songname, '-', quality.name);
};

const handleDownloadComplete = (song, url, quality) => {
    console.log('下载完成:', song.songname);
};

const handleDownloadFail = (song, error) => {
    console.error('下载失败:', error.message);
};

const handleQualitySelect = (quality) => {
    console.log('选择音质:', quality.name);
};

onMounted(async () => {
    try {
        const response = await get('/rank/list');
        if (response.status === 1) {
            allRanks.value = response.data.info;
            
            // 默认选择名品堂
            const mingPinTang = allRanks.value.find(rank => rank.rankname === '名品堂');
            if (mingPinTang) {
                await selectRank(mingPinTang);
            } else if (allRanks.value.length > 0) {
                await selectRank(allRanks.value[0]);
            }
        }
    } catch (err) {
        console.error('加载排行榜列表失败:', err);
        error.value = '加载排行榜失败';
    }
    
    // 添加window滚动事件监听器
    window.addEventListener('scroll', handleScroll);
});

onUnmounted(() => {
    // 移除window滚动事件监听器
    window.removeEventListener('scroll', handleScroll);
});
</script>

<style scoped>
.ranking-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
    min-height: 100vh;
    box-sizing: border-box;
}

.rank-selector {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.rank-chip {
    padding: 8px 16px;
    border-radius: 20px;
    background: #f5f5f5;
    color: #666;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.rank-chip:hover {
    background: #eeeeee;
    transform: translateY(-2px);
}

.rank-chip.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)!important;
    color: white;
}

.ranking-detail {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.rank-container {
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.ranking-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    padding: 20px;
}

.ranking-item {
    background: #ffffff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    transition: all 0.3s ease;
    height: 600px;
    display: flex;
    flex-direction: column;
}

.ranking-item:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}

.ranking-header {
    display: flex;
    align-items: center;
    padding: 20px;
    position: relative;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.rank-cover {
    width: 100px;
    height: 100px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.rank-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
}

.rank-cover:hover img {
    transform: scale(1.05);
}

.rank-info {
    flex: 1;
    margin-left: 20px;
}

.rank-title {
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: white;
}

.rank-update {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
}

.rank-actions {
    position: absolute;
    top: 20px;
    right: 20px;
}

.play-all-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.9);
    color: var(--primary-color);
    border: none;
    font-size: 18px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.play-all-btn:hover {
    transform: scale(1.1);
    background: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.play-all-btn i {
    font-size: 18px;
}

.song-list {
    background: rgba(255, 255, 255, 0.9);
    padding: 16px;
}

.song-item {
    display: flex;
    align-items: center;
    padding: 12px 8px;
    border-radius: 8px;
    transition: all 0.2s ease;
    cursor: pointer;
}

.song-item:hover {
    background: #f8f9fa;
}

.song-rank {
    width: 40px;
    text-align: center;
}

.song-index {
    font-size: 16px;
    font-weight: 500;
    color: #999;
}

.song-index.top-three {
    font-size: 18px;
    font-weight: 600;
    background: linear-gradient(45deg, #ff6b6b, #ff8787);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.song-cover {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 8px;
    overflow: hidden;
    margin: 0 16px;
}

.song-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.hover-play {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.song-item:hover .hover-play {
    opacity: 1;
}

.hover-play i {
    color: white;
    font-size: 24px;
}

.song-info {
    flex: 1;
    min-width: 0;
    padding-right: 12px;
}

.song-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
}

.song-main {
    flex: 2;
    min-width: 0;
    margin-right: 16px;
}

.song-name {
    font-size: 14px;
    font-weight: 500;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.song-author {
    font-size: 13px;
    color: #666;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.song-meta {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
}

.album {
    flex: 1;
    font-size: 12px;
    color: #999;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 16px;
    text-align: right;
}

.duration {
    font-size: 12px;
    color: #999;
    flex-shrink: 0;
    min-width: 45px;
    text-align: right;
}

.song-actions {
    display: flex;
    gap: 8px;
    margin-left: 8px;
}

.action-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: #f5f5f5;
    color: #666;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
}

.action-btn:hover {
    background: var(--primary-color);
    color: white;
    transform: scale(1.1);
}

.action-btn i {
    font-size: 14px;
}

.song-list::-webkit-scrollbar {
    width: 6px;
}

.song-list::-webkit-scrollbar-thumb {
    background: #ddd;
    border-radius: 3px;
}

.song-list::-webkit-scrollbar-track {
    background: #f5f5f5;
}

.loading-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    color: #666;
    font-size: 14px;
    gap: 8px;
}

.loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #f3f3f3;
    border-top: 2px solid var(--primary-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.no-more-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    color: #999;
    font-size: 13px;
    border-top: 1px solid #f0f0f0;
    margin-top: 8px;
}

@media (max-width: 1200px) {
    .ranking-list {
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
        padding: 15px;
    }
    
    .ranking-item {
        height: 500px;
        min-height: 500px;
    }
    
    .rank-header {
        padding: 15px;
    }
    
    .rank-cover {
        width: 80px;
        height: 80px;
    }
    
    .rank-title {
        font-size: 20px;
    }
    
    .rank-update {
        font-size: 12px;
    }
}

@media (max-width: 768px) {
    .ranking-container {
        padding: 10px;
    }
    
    .rank-selector {
        padding: 12px;
        gap: 8px;
    }
    
    .rank-chip {
        padding: 6px 12px;
        font-size: 12px;
    }
    
    .ranking-list {
        gap: 10px;
        padding: 10px;
        grid-template-columns: 1fr;
    }
    
    .ranking-item {
        height: 400px;
    }
    
    .rank-cover {
        width: 60px;
        height: 60px;
    }
    
    .rank-info {
        margin-left: 10px;
    }
    
    .rank-title {
        font-size: 16px;
        margin: 0 0 4px 0;
    }
    
    .song-cover {
        width: 40px;
        height: 40px;
        margin: 0 10px;
    }
    
    .song-rank {
        width: 30px;
    }
    
    .song-name {
        font-size: 13px;
    }
    
    .song-author {
        font-size: 12px;
    }
    
    .album {
        display: none;
    }
}

:global(.music-note) {
    position: fixed;
    color: #ff6b6b;
    font-size: 24px;
    pointer-events: none;
    z-index: 9999;
    transition: all 1s cubic-bezier(0.4, 0, 0.2, 1);
}

.action-menu-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
}

.action-menu {
    position: absolute;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    padding: 8px 0;
    min-width: 180px;
    z-index: 1001;
}

.action-menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    cursor: pointer;
    transition: background 0.2s ease;
    color: #333;
    font-size: 14px;
}

.action-menu-item:hover {
    background: #f5f5f5;
}

.action-menu-item i {
    font-size: 16px;
    color: #667eea;
    width: 20px;
    text-align: center;
}
</style>