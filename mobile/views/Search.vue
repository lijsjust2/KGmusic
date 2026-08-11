<template>
    <!-- 搜索头部 -->
    <div class="search-header">
        <div class="search-input-container">
            <i class="fas fa-search search-icon"></i>
            <input 
                type="text" 
                class="search-input" 
                v-model="searchQuery" 
                placeholder="搜索歌曲、歌手、专辑..." 
                @focus="showSearchSuggestions = true"
                @input="handleInput"
                @keyup.enter="submitSearch"
            />
            <button 
                v-if="searchQuery" 
                class="clear-button" 
                @click="clearSearch"
            >
                <i class="fas fa-times"></i>
            </button>
        </div>
        <button class="cancel-button" @click="goBack">取消</button>
    </div>

    <!-- 搜索历史/热门 -->
    <div v-if="showSearchSuggestions" class="search-suggestions">
            <!-- 搜索历史 -->
            <div v-if="searchHistory.length > 0" class="history-section">
                <div class="history-header">
                    <h3 class="section-title">搜索历史</h3>
                    <button class="clear-history" @click="clearHistory">
                        <i class="fas fa-trash"></i>
                        清空
                    </button>
                </div>
                <div class="history-tags">
                    <span 
                        v-for="(item, index) in searchHistory" 
                        :key="index" 
                        class="history-tag"
                        @click="searchWithHistory(item)"
                    >
                        {{ item }}
                    </span>
                </div>
            </div>

            <!-- 热门搜索 -->
            <div class="hot-section">
                <h3 class="section-title">热门搜索</h3>
                <div class="hot-tags">
                    <span 
                        v-for="(item, index) in hotSearches" 
                        :key="index" 
                        class="hot-tag"
                        :class="{ 'top': index < 3 }"
                        @click="searchWithHot(item)">
                        <span class="hot-rank">{{ index + 1 }}</span>
                        {{ item }}
                    </span>
                </div>
            </div>
        </div>

        <!-- 搜索结果 -->
        <div v-else class="search-results">
            <h2 class="section-title">{{ $t('sou-suo-jie-guo') }}</h2>
            <!-- 添加搜索类型标签栏 -->
            <div class="search-tabs">
                <button 
                    v-for="tab in searchTabs" 
                    :key="tab.type" 
                    :class="['tab-button', { active: searchType === tab.type }]"
                    @click="changeSearchType(tab.type)"
                >
                    {{ tab.name }}
                </button>
            </div>
            <!-- 骨架屏加载效果 -->
            <div v-if="isLoading" class="skeleton-container">
                <!-- 歌曲骨架屏 -->
                <div v-if="searchType === 'song'" class="song-skeleton">
                    <div v-for="i in 10" :key="i" class="skeleton-item result-item">
                        <div class="skeleton-cover"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-line"></div>
                            <div class="skeleton-line short"></div>
                        </div>
                        <div class="skeleton-actions">
                            <div class="skeleton-button"></div>
                            <div class="skeleton-button"></div>
                        </div>
                    </div>
                </div>
                
                <!-- 歌手/专辑/歌单共用骨架屏 -->
                <div v-else class="grid-skeleton">
                    <div class="skeleton-grid">
                        <div v-for="i in 12" :key="i" :class="['skeleton-grid-card', {
                            'skeleton-artist-card': searchType === 'author',
                            'skeleton-album-card': searchType === 'album',
                            'skeleton-playlist-card': searchType === 'special'
                        }]">
                            <div :class="[searchType === 'author' ? 'skeleton-avatar' : 'skeleton-cover square']"></div>
                            <div class="skeleton-line"></div>
                            <div v-if="searchType !== 'author'" class="skeleton-line short"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <template v-else-if="searchResults.length > 0">
                <!-- 歌曲搜索结果 -->
                <ul v-if="searchType === 'song'">
                    <li v-for="(result, index) in searchResults" :key="index" class="result-item"
                        @click="playSong(result?.HQFileHash || result?.SQFileHash || result?.FileHash, result.OriSongName, getCover(result.Image, 480), result.SingerName, result.Duration || result.duration || 0, { album_name: result.AlbumName, album_id: result.AlbumID, publish_date: result.PublishDate, Image: result.Image, FileHash: result.FileHash, OriSongName: result.OriSongName, SingerName: result.SingerName })">
                        <img :src="getCover(result.Image, 100)" alt="Cover" />
                        <div class="result-info">
                            <p class="result-name">{{ result.OriSongName }}</p>
                            <p class="result-type">{{ result.SingerName }}</p>
                        </div>
                        <div class="song-actions">
                            <button class="action-btn play-btn" @click.stop="playSong(result?.HQFileHash || result?.SQFileHash || result?.FileHash, result.OriSongName, getCover(result.Image, 480), result.SingerName, result.Duration || result.duration || 0, { album_name: result.AlbumName, album_id: result.AlbumID, publish_date: result.PublishDate, Image: result.Image, FileHash: result.FileHash, OriSongName: result.OriSongName, SingerName: result.SingerName })">
                                <i class="fas fa-play"></i>
                            </button>
                            <button class="action-btn more-btn" @click.stop="toggleMoreMenu(result, $event)">
                                <i class="fas fa-ellipsis-h"></i>
                            </button>
                        </div>
                    </li>
                </ul>
                
                <!-- 歌手搜索结果 -->
                <ArtistGrid v-else-if="searchType === 'author'" :artists="searchResults" @artist-click="handleArtistClick" />
                
                <!-- 专辑搜索结果 -->
                <AlbumGrid v-else-if="searchType === 'album'" :albums="searchResults" @album-click="handleAlbumClick" />
                
                <!-- 歌单搜索结果 -->
                <PlaylistGrid v-else-if="searchType === 'special'" :playlists="searchResults" @playlist-click="handlePlaylistClick" />

                <div class="pagination">
                    <button @click="prevPage" :disabled="currentPage === 1">{{ $t('shang-yi-ye') }}</button>
                    <div class="page-numbers">
                        <button v-for="pageNum in displayedPageNumbers" :key="pageNum" :class="['page-number', {
                            active: pageNum === currentPage,
                            'ellipsis': pageNum === '...'
                        }]" @click="pageNum !== '...' && goToPage(pageNum)" :disabled="pageNum === '...'">
                            {{ pageNum }}
                        </button>
                    </div>
                    <button @click="nextPage" :disabled="currentPage === totalPages">{{ $t('xia-yi-ye') }}</button>
                </div>
            </template>
        </div>

        <SongActionMenu
          :show="showMoreMenu"
          :song="selectedSong"
          @close="closeMoreMenu"
          @add-to-playlist="handleAddToPlaylist"
          @play-now="handlePlayNow"
          @download-start="handleDownloadStart"
          @download-complete="handleDownloadComplete"
          @download-fail="handleDownloadFail"
          @quality-select="handleQualitySelect"
        />
</template>
<script setup>
import { ref, onMounted, watch, computed, getCurrentInstance, onActivated } from 'vue';
import AlbumGrid from '../components/AlbumGrid.vue';
import PlaylistGrid from '../components/PlaylistGrid.vue';
import ArtistGrid from '../components/ArtistGrid.vue';
import SongActionMenu from '../components/SongActionMenu.vue';
import { get } from '../utils/request';
import { useRoute, useRouter } from 'vue-router';
import { useSearchStore } from '../stores/searchStore';

const route = useRoute();
const router = useRouter();
const { proxy } = getCurrentInstance();
const searchStore = useSearchStore();

const getCover = (cover, size) => {
  if (!cover) return null;
  return proxy.$getCover(cover, size);
};

const searchQuery = ref(searchStore.searchQuery || route.query.q || '');
const searchType = ref(searchStore.searchType || route.query.type || 'song'); 
const searchResults = ref(searchStore.searchResults || []);
const currentPage = ref(searchStore.currentPage || 1);
const pageSize = ref(searchStore.pageSize || 30);
const totalPages = ref(searchStore.totalPages || 1);
const isLoading = ref(false);

const showSearchSuggestions = ref(!searchStore.hasSearched && !route.query.q);
const searchHistory = ref([]);
const hotSearches = ref([
    '周杰伦', '陈奕迅', '五月天', 'Taylor Swift', '林俊杰',
    '李荣浩', '张惠妹', '杨宗纬', '梁静茹', '刘若英'
]);

// 更多操作菜单状态
const showMoreMenu = ref(false);
const selectedSong = ref(null);

const searchTabs = [
    { type: 'song', name: '单曲' },
    { type: 'special', name: '歌单' },
    { type: 'album', name: '专辑' },
    { type: 'author', name: '歌手' }
];

// 初始化搜索历史
const initSearchHistory = () => {
    const history = localStorage.getItem('searchHistory');
    if (history) {
        searchHistory.value = JSON.parse(history);
    }
};

// 保存搜索历史
const saveSearchHistory = (query) => {
    if (!query) return;
    
    // 移除重复项
    searchHistory.value = searchHistory.value.filter(item => item !== query);
    
    // 添加到开头
    searchHistory.value.unshift(query);
    
    // 限制历史记录数量
    if (searchHistory.value.length > 10) {
        searchHistory.value = searchHistory.value.slice(0, 10);
    }
    
    // 保存到本地存储
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory.value));
};

// 切换搜索类型
const changeSearchType = (type) => {
    searchType.value = type;
    currentPage.value = 1; // 切换类型时重置页码
    
    // 更新URL参数
    router.push({
        query: { 
            ...route.query,
            type: type 
        }
    });
    performSearch();
};

// 更多操作菜单相关方法
const toggleMoreMenu = (song, event) => {
    event.stopPropagation();
    selectedSong.value = {
        ...song,
        hash: song?.HQFileHash || song?.SQFileHash || song?.FileHash,
        name: song.OriSongName,
        img: getCover(song.Image, 480),
        author: song.SingerName
    };
    showMoreMenu.value = true;
};

const closeMoreMenu = () => {
    showMoreMenu.value = false;
    selectedSong.value = null;
};

const handleAddToPlaylist = (song) => {
    if (song && window.playerControl && window.playerControl.addToPlaylist) {
        window.playerControl.addToPlaylist(
            song.hash,
            song.name,
            song.img,
            song.author
        );
    }
};

const handlePlayNow = (song) => {
    if (song) {
        playSong(song.hash, song.name, song.img, song.author);
    }
};

// 下载事件处理
const handleDownloadStart = (song, quality) => {
    console.log('下载开始:', song.name, '-', quality.name);
};

const handleDownloadComplete = (song, url, quality) => {
    console.log('下载完成:', song.name);
    closeMoreMenu();
};

const handleDownloadFail = (song, error) => {
    console.error('下载失败:', error.message);
};

const handleQualitySelect = (quality) => {
    console.log('选择音质:', quality.name);
};

onMounted(() => {
    initSearchHistory();
    if (route.query.type) {
        searchType.value = route.query.type;
    }
    if (route.query.q) {
        showSearchSuggestions.value = false;
        performSearch();
    } else if (searchStore.hasSearched) {
        showSearchSuggestions.value = false;
    }
});

onActivated(() => {
    if (searchStore.hasSearched) {
        searchQuery.value = searchStore.searchQuery;
        searchType.value = searchStore.searchType;
        searchResults.value = searchStore.searchResults;
        currentPage.value = searchStore.currentPage;
        totalPages.value = searchStore.totalPages;
        pageSize.value = searchStore.pageSize;
        showSearchSuggestions.value = false;
    }
});

watch(() => route.query.q, (newQuery) => {
    currentPage.value = 1;
    searchQuery.value = newQuery;
    if (newQuery) {
        showSearchSuggestions.value = false;
        performSearch();
    }
});

const playSong = (hash, name, img, author, timelen, extraData) => {
    if (window.playerControl && window.playerControl.addSongToQueue) {
        window.playerControl.addSongToQueue(hash, name, img, author, timelen || 0, extraData);
    } else {
        console.error('Player control is not available');
    }
};

const performSearch = async () => {
    if (!searchQuery.value) return;
    isLoading.value = true;
    try {
        const response = await get(`/search?keywords=${encodeURIComponent(searchQuery.value)}&page=${currentPage.value}&pagesize=${pageSize.value}&type=${searchType.value}`)
        if (response.status === 1) {
            searchResults.value = response.data.lists;
            totalPages.value = Math.ceil(response.data.total / pageSize.value);
            
            searchStore.setSearchQuery(searchQuery.value);
            searchStore.setSearchType(searchType.value);
            searchStore.setSearchResults(response.data.lists);
            searchStore.setCurrentPage(currentPage.value);
            searchStore.setTotalPages(totalPages.value);
            searchStore.setPageSize(pageSize.value);
        }
    } catch (error) {
        console.error("搜索请求失败", error);
    } finally {
        isLoading.value = false;
    }
};

// 分页操作
const nextPage = () => {
    if (currentPage.value < totalPages.value) {
        currentPage.value++;
        performSearch();
    }
};

const prevPage = () => {
    if (currentPage.value > 1) {
        currentPage.value--;
        performSearch();
    }
};

const displayedPageNumbers = computed(() => {
    const delta = 2; // 当前页前后显示的页码数
    let pages = [];

    if (totalPages.value <= 7) {
        // 如果总页数小于等于7，显示所有页码
        for (let i = 1; i <= totalPages.value; i++) {
            pages.push(i);
        }
    } else {
        // 始终显示第一页
        pages.push(1);

        // 计算中间页码的范围
        let leftBound = Math.max(2, currentPage.value - delta);
        let rightBound = Math.min(totalPages.value - 1, currentPage.value + delta);

        // 添加左边的省略号
        if (leftBound > 2) {
            pages.push('...');
        }

        // 添加中间的页码
        for (let i = leftBound; i <= rightBound; i++) {
            pages.push(i);
        }

        // 添加右边的省略号
        if (rightBound < totalPages.value - 1) {
            pages.push('...');
        }

        // 始终显示最后一页
        pages.push(totalPages.value);
    }

    return pages;
});

const goToPage = (page) => {
    currentPage.value = page;
    performSearch();
};

const handleAlbumClick = (album) => {
    router.push(`/PlaylistDetail?albumid=${album.albumid}`);
};

const handlePlaylistClick = (playlist) => {
    router.push({
        path: `/PlaylistDetail`,
        query: { global_collection_id: playlist.gid }
    });
};

const handleArtistClick = (artist) => {
    router.push({
        path: '/PlaylistDetail',
        query: { 
            singerid: artist.AuthorId
        }
    });
};

const handleInput = async () => {
};

const submitSearch = () => {
    if (searchQuery.value.trim()) {
        showSearchSuggestions.value = false;
        saveSearchHistory(searchQuery.value.trim());
        
        // 更新URL参数
        router.push({
            query: {
                q: searchQuery.value.trim(),
                type: searchType.value
            }
        });
        
        performSearch();
    }
};

const clearSearch = () => {
    searchQuery.value = '';
    searchResults.value = [];
    searchStore.clearSearch();
    showSearchSuggestions.value = true;
};

const searchWithHistory = (item) => {
    searchQuery.value = item;
    submitSearch();
};

const searchWithHot = (item) => {
    searchQuery.value = item;
    submitSearch();
};

const clearHistory = () => {
    searchHistory.value = [];
    localStorage.removeItem('searchHistory');
};

const goBack = () => {
    searchQuery.value = '';
    searchResults.value = [];
    currentPage.value = 1;
    totalPages.value = 1;
    searchStore.clearSearch();
    showSearchSuggestions.value = true;
};
</script>

<style scoped>
/* 搜索头部 */
.search-header {
    display: flex;
    align-items: center;
    padding: 10px 20px;
    background-color: white;
    position: sticky;
    top: 60px;
    z-index: 1001;
}

.search-input-container {
    flex: 1;
    display: flex;
    align-items: center;
    background-color: #f0f0f0;
    border-radius: 20px;
    padding: 0 15px;
    margin-right: 10px;
}

.search-icon {
    color: #999;
    margin-right: 10px;
}

.search-input {
    flex: 1;
    border: none;
    background: transparent;
    padding: 10px 0;
    font-size: 16px;
    outline: none;
}

.clear-button {
    background: none;
    border: none;
    color: #999;
    cursor: pointer;
    padding: 5px;
}

.cancel-button {
    background: none;
    border: none;
    color: var(--primary-color);
    font-size: 16px;
    cursor: pointer;
    padding: 10px;
}

/* 搜索建议 */
.search-suggestions {
    padding: 20px;
    background-color: white;
}

.history-section,
.hot-section {
    margin-bottom: 30px;
}

/* 搜索历史 */
.history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
}

.clear-history {
    background: none;
    border: none;
    color: #999;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
}

.history-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.history-tag {
    background-color: #f0f0f0;
    padding: 8px 16px;
    border-radius: 16px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s;
}

.history-tag:hover {
    background-color: var(--primary-color);
    color: white;
}

/* 热门搜索 */
.hot-tags {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.hot-tag {
    display: flex;
    align-items: center;
    padding: 10px 0;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
}

.hot-tag:hover {
    background-color: #f5f5f5;
}

.hot-rank {
    display: inline-block;
    width: 24px;
    height: 24px;
    line-height: 24px;
    text-align: center;
    border-radius: 4px;
    margin-right: 15px;
    font-size: 14px;
    font-weight: bold;
}

.hot-tag:not(.top) .hot-rank {
    background-color: #f0f0f0;
    color: #999;
}

.hot-tag.top:nth-child(1) .hot-rank {
    background-color: #ff4d4f;
    color: white;
}

.hot-tag.top:nth-child(2) .hot-rank {
    background-color: #fa8c16;
    color: white;
}

.hot-tag.top:nth-child(3) .hot-rank {
    background-color: #faad14;
    color: white;
}

/* 搜索结果 */
.search-results {
    padding: 20px;
    background-color: white;
}

.search-tabs {
    display: flex;
    margin-bottom: 20px;
    border-bottom: 1px solid #eee;
}

.tab-button {
    padding: 10px 20px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    color: #666;
    position: relative;
    transition: all 0.3s;
    border-radius: 5px 5px 0 0;
}

.tab-button:hover {
    color: var(--primary-color);
}

.tab-button.active {
    color: var(--primary-color);
    font-weight: bold;
}

.tab-button.active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    width: 100%;
    height: 2px;
    background-color: var(--primary-color);
}

.result-item {
    display: flex;
    align-items: center;
    padding: 10px;
    border-bottom: 1px solid #f0f0f0;
    transition: background-color 0.3s;
    cursor: pointer;
    border-radius: 5px;
    gap: 10px;
}

.result-item:hover {
    background-color: #f5f5f5;
}

.result-item img {
    width: 50px;
    height: 50px;
    border-radius: 5px;
    margin-right: 10px;
}

.result-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0; /* 防止flex子项溢出 */
}

.result-meta {
    display: flex;
    margin-left: auto;
    min-width: 120px;
    justify-content: flex-end;
    padding-right: 20px;
}

.meta-column {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
}

.result-name {
    font-size: 16px;
    font-weight: bold;
    height: 23px;
    margin: 0;
    max-width: 900px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.result-duration,
.result-publish-date {
    font-size: 14px;
    color: #888;
    margin: 0;
    white-space: nowrap;
}

.result-duration {
    color: #666;
}

.result-publish-date {
    font-size: 12px;
    color: #999;
}

.result-type {
    font-size: 14px;
    color: #666;
    margin: 6px 0 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.song-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.action-btn:hover {
  background: #667eea;
  color: white;
  transform: scale(1.1);
}

/* 骨架屏加载效果 - 操作按钮 */
.skeleton-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.skeleton-button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 20px 0;
    gap: 10px;
}

.page-numbers {
    display: flex;
    gap: 5px;
}

.page-number {
    padding: 8px 12px;
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    color: #333;
    min-width: 40px;
    transition: all 0.3s;
}

.page-number:hover {
    background-color: var(--primary-color);
    color: white;
}

.page-number.active {
    background-color: var(--primary-color);
    color: white;
    border-color: var(--primary-color);
}

.pagination button {
    padding: 8px 15px;
    background-color: white;
    color: #333;
    border: 1px solid #ddd;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;
}

.pagination button:hover:not(:disabled) {
    background-color: var(--primary-color);
    color: white;
}

.pagination button:disabled {
    background-color: white;
    color: #999;
    cursor: not-allowed;
    border-color: #ddd;
}

.section-title {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 20px;
    color: #333;
}

.page-number.ellipsis {
    background-color: transparent;
    border: none;
    cursor: default;
    pointer-events: none;
    padding: 8px 8px;
    min-width: 30px;
}

.page-number.ellipsis:hover {
    background-color: transparent;
    color: #333;
}


</style>

<!-- 添加骨架屏样式 -->
<style scoped>
/* 骨架屏动画 */
@keyframes shimmer {
    0% {
        background-position: -468px 0;
    }
    100% {
        background-position: 468px 0;
    }
}

.skeleton-container {
    width: 100%;
}

.skeleton-item {
    margin-bottom: 15px;
}

.skeleton-cover, .skeleton-avatar {
    width: 50px;
    height: 50px;
    border-radius: 5px;
    background: linear-gradient(to right, #f0f0f0 8%, #e0e0e0 18%, #f0f0f0 33%);
    background-size: 800px 104px;
    animation: shimmer 1.5s linear infinite forwards;
}

.skeleton-avatar {
    border-radius: 50%;
    width: 100px;
    height: 100px;
    margin: 0 auto 10px;
}

.skeleton-cover.square {
    width: 150px;
    height: 150px;
    margin: 0 auto 10px;
}

.skeleton-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.skeleton-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 120px;
    align-items: flex-end;
}

.skeleton-line {
    height: 16px;
    background: linear-gradient(to right, #f0f0f0 8%, #e0e0e0 18%, #f0f0f0 33%);
    background-size: 800px 104px;
    animation: shimmer 1.5s linear infinite forwards;
    border-radius: 3px;
    width: 100%;
    margin-top: 5px;
}

.skeleton-line.short {
    width: 60%;
}

.skeleton-line.tiny {
    width: 40%;
    height: 12px;
}

.skeleton-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 20px;
}

.skeleton-artist-card, .skeleton-album-card, .skeleton-playlist-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 15px;
    background-color: #f9f9f9;
    border-radius: 8px;
    transition: transform 0.3s;
}
</style>