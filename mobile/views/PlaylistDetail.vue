<template>
    <div class="detail-page">
        <!-- 头部信息区域 -->
        <div class="header" :class="{ 'artist-header': isArtist, 'album-header': isAlbum, 'playlist-header': !isArtist && !isAlbum }">
            <img v-if="isArtist || playlistCover" class="cover-art" :class="{ 'artist-avatar': isArtist, 'header-album-cover': isAlbum, 'playlist-cover': !isArtist && !isAlbum }" :data-playlist-id="detail.listid || null"
                :src="isArtist ? ($getCover(detail.sizable_avatar, 100)) : (isAlbum ? $getCover(playlistCover, 100) : $getCover(playlistCover, 100))" />
            <div v-else class="cover-art-placeholder" :class="{ 'artist-avatar': isArtist, 'header-album-cover': isAlbum, 'playlist-cover': !isArtist && !isAlbum }">
                <i class="fas fa-compact-disc"></i>
            </div>
            <div class="info">
                <h1 class="title">{{ isArtist ? detail.author_name : detail.name }}</h1>
                <div class="stats" v-if="isArtist">
                    <span>歌曲: {{ detail.song_count }}</span>
                    <span>专辑: {{ detail.album_count }}</span>
                </div>
                <div class="playlist-actions" v-if="isArtist">
                    <button class="batch-action-btn" @click="goToBatchDownload">
                        <i class="fas fa-download"></i>
                        <span>批量下载</span>
                    </button>
                </div>
                <div class="stats" v-if="isAlbum">
                    <span>歌手: {{ detail.author_name }}</span>
                    <span>歌曲: {{ detail.song_count }}</span>
                    <span>发布: {{ detail.publish_date }}</span>
                </div>
                <div class="stats" v-if="!isArtist && !isAlbum">
                    <span>歌曲: {{ detail.count || totalCount }}</span>
                    <span>创建者: {{ detail.list_create_username }}</span>
                </div>
                <div class="playlist-actions" v-if="!isArtist && !isAlbum && !detail.is_def && detail.list_create_userid == MoeAuth.UserInfo?.userid">
                    <button class="batch-action-btn" @click="editPlaylist">
                        <i class="fas fa-edit"></i>
                        <span>编辑</span>
                    </button>
                    <button class="batch-action-btn" @click="deletePlaylist">
                        <i class="fas fa-trash-alt"></i>
                        <span>删除</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- 歌单描述（仅歌单详情显示） -->
        <div v-if="!isArtist && !isAlbum && detail.intro" class="playlist-description">
            {{ detail.intro }}
        </div>

        <!-- 标签切换（仅歌手详情显示） -->
        <div v-if="isArtist" class="tab-container">
            <div 
                class="tab-item" 
                :class="{ active: activeTab === 'songs' }"
                @click="switchTab('songs')"
            >
                <i class="fas fa-music"></i>
                <span>歌曲 ({{ detail.song_count || 0 }})</span>
            </div>
            <div 
                class="tab-item" 
                :class="{ active: activeTab === 'albums' }"
                @click="switchTab('albums')"
            >
                <i class="fas fa-compact-disc"></i>
                <span>专辑 ({{ detail.album_count || 0 }})</span>
            </div>
        </div>

        <!-- 歌曲列表 -->
        <div v-if="!isArtist || activeTab === 'songs'" class="track-list-container">
            <div class="track-list-header">
                <h2 v-if="!isArtist" class="track-list-title"><span>{{ $t('ge-qu-lie-biao') }}</span> ( {{ displayTrackCount }} )</h2>
                <div class="track-list-header-bottom">
                    <div class="track-list-actions-left">
                        <div class="batch-action-container">
                            <button class="batch-action-btn" @click="toggleBatchSelection" :class="{ 'active': batchSelectionMode }">
                                {{ batchSelectionMode ? '取消批量' : '批量' }}
                                <span v-if="selectedTracks.length > 0" class="selected-count">{{ selectedTracks.length }}</span>
                            </button>
                            <button v-if="batchSelectionMode && selectedTracks.length > 0" class="batch-action-btn action-btn" @click="toggleBatchMenu">
                                操作
                            </button>
                            <BatchActionsMenu
                                :show="batchSelectionMode && isBatchMenuVisible && selectedTracks.length > 0"
                                :show-add-to-playlist="!!MoeAuth.UserInfo?.userid"
                                :show-remove-from-playlist="!isArtist && detail.list_create_userid == MoeAuth.UserInfo?.userid && route.query.listid"
                                @append-to-queue="appendSelectedToQueue"
                                @add-to-other-playlist="addSelectedToOtherPlaylist"
                                @remove-from-playlist="removeSelectedFromPlaylist"
                                @batch-download="handleBatchDownload"
                                @close="handleBatchMenuClose"
                            />
                        </div>
                        <!-- 歌手歌曲排序选择 -->
                        <div v-if="isArtist" class="sort-selector">
                            <button class="sort-btn" :class="{ 'active': artistSortType === 'hot' }" @click="changeArtistSort('hot')">
                                热门
                            </button>
                            <button class="sort-btn" :class="{ 'active': artistSortType === 'new' }" @click="changeArtistSort('new')">
                                最新
                            </button>
                        </div>
                    </div>
                    <div class="track-list-actions-right">
                        <input type="text" v-model="searchQuery" @keyup.enter="searchTracks" :placeholder="t('sou-suo-ge-qu')" class="search-input" />
                    </div>
                </div>
            </div>

            <!-- 表头 -->
            <div class="track-list-header-row">
                <div class="track-checkbox-header" v-if="batchSelectionMode">
                    <input type="checkbox" :checked="isAllSelected" @click="toggleSelectAll">
                </div>
                <div class="track-number-header" v-else>♪</div>
                <div class="track-title-header" @click="sortTracks('name')">
                    歌名<i class="fas" :class="getSortIconClass('name')"></i>
                </div>
                <div class="track-artist-header" @click="sortTracks('author')">
                    歌手<i class="fas" :class="getSortIconClass('author')"></i>
                </div>
                <div class="track-album-header" @click="sortTracks('album')">
                    专辑<i class="fas" :class="getSortIconClass('album')"></i>
                </div>
                <div class="track-timelen-header" @click="sortTracks('timelen')">
                    时长 <i class="fas" :class="getSortIconClass('timelen')"></i>
                </div>
                <div class="track-actions-header">
                    操作
                </div>
            </div>

            <!-- 搜索加载动画 -->
            <div v-if="isSearching" class="search-loading-overlay">
                <div class="search-loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>{{ $t('zheng-zai-jia-zai-quan-bu-ge-qu') }}</span>
                </div>
            </div>

            <div v-else ref="trackListRef" class="track-list">
                <div v-for="(item, index) in filteredTracks" :key="item.hash"
                    class="li" :class="{ 'selected': selectedTracks.includes(index) }"
                    @click="batchSelectionMode ? selectTrack(index, $event) : playSong(item.hash, item.name, item.cover, item.author, item.timelen, { album_name: item.album_name, album_id: item.album_id, publish_date: item.publish_date })"
                    @contextmenu.prevent="showContextMenu($event, item)">

                    <!-- 复选框或序号 -->
                    <div class="track-checkbox" v-if="batchSelectionMode">
                        <input type="checkbox" :checked="selectedTracks.includes(index)" @click.stop="selectTrack(index, $event)">
                    </div>
                    <div class="track-number" v-else :class="{ 'current': isCurrentSong(item.hash) }">
                        <div v-if="isCurrentPlaying(item.hash)" class="sound-wave">
                            <span></span><span></span><span></span>
                        </div>
                        <span v-else>{{ index + 1 }}</span>
                    </div>

                    <!-- 歌曲信息 -->
                    <div class="track-title-container">
                        <div class="track-title" :title="item.name" :class="{ 'current': isCurrentSong(item.hash) }">{{ item.name }}</div>
                    </div>
                    <div class="track-artist" :title="item.author">{{ item.author }}</div>
                    <div class="track-album" :title="item.album">{{ item.album }}</div>
                    <div class="track-timelen">
                        <button v-if="props.playerControl?.currentSong.hash == item.hash"
                            class="queue-play-btn fas fa-music"></button>
                        {{ $formatMilliseconds(item.timelen) }}
                    </div>
                    <div class="track-actions">
                        <button class="play-btn" @click.stop="playSong(item.hash, item.name, item.cover, item.author, item.timelen, { album_name: item.album_name, album_id: item.album_id, publish_date: item.publish_date })" title="播放">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="more-btn" @click.stop="showContextMenu($event, item)" title="更多操作">
                            <i class="fas fa-ellipsis-h"></i>
                        </button>
                    </div>
                </div>
            </div>
            
            <div v-if="isLoadingMore" class="load-more-indicator">
                <i class="fas fa-spinner fa-spin"></i>
                <span>加载中...</span>
            </div>
            
            <div v-if="!hasMore && filteredTracks.length > 0 && !isArtist" class="no-more-data">
                <span>已加载全部歌曲</span>
            </div>
            
            <!-- 歌曲分页（仅歌手详情页显示） -->
            <div class="pagination" v-if="isArtist && totalArtistPages > 1">
                <button 
                    class="pagination-btn" 
                    :disabled="currentPage === 1"
                    @click="goToArtistPage(1)"
                >
                    <i class="fas fa-angle-double-left"></i>
                </button>
                <button 
                    class="pagination-btn" 
                    :disabled="currentPage === 1"
                    @click="goToArtistPage(currentPage - 1)"
                >
                    <i class="fas fa-angle-left"></i>
                </button>
                <span class="pagination-info">
                    第 {{ currentPage }} / {{ totalArtistPages }} 页
                </span>
                <button 
                    class="pagination-btn" 
                    :disabled="currentPage === totalArtistPages"
                    @click="goToArtistPage(currentPage + 1)"
                >
                    <i class="fas fa-angle-right"></i>
                </button>
                <button 
                    class="pagination-btn" 
                    :disabled="currentPage === totalArtistPages"
                    @click="goToArtistPage(totalArtistPages)"
                >
                    <i class="fas fa-angle-double-right"></i>
                </button>
            </div>
        </div>

        <!-- 专辑列表（歌手详情且切换到专辑标签时显示） -->
        <div v-if="isArtist && activeTab === 'albums'" class="album-list-container">
            <div v-if="albumsLoading" class="loading-overlay">
                <i class="fas fa-spinner fa-spin"></i>
                <span>加载中...</span>
            </div>
            <div v-else class="album-grid">
                <div 
                    v-for="(album, index) in albums" 
                    :key="index" 
                    class="album-card"
                    @click="goToAlbumDetail(album)"
                >
                    <div class="album-cover">
                        <img 
                            v-if="album.sizable_cover" 
                            :src="album.sizable_cover.replace('{size}', '300')" 
                            alt="专辑封面"
                        />
                        <div v-else class="cover-placeholder">
                            <i class="fas fa-compact-disc"></i>
                        </div>
                        <div class="album-overlay">
                            <button class="play-button">
                                <i class="fas fa-play"></i>
                            </button>
                        </div>
                    </div>
                    <div class="album-info">
                        <h3 class="album-name">{{ album.album_name || '未知专辑' }}</h3>
                        <div class="album-artist">{{ album.author_name || '未知歌手' }}</div>
                        <div class="album-meta">
                            <div class="meta-item" v-if="album.publish_date">
                                <i class="fas fa-calendar-alt"></i>
                                <span>{{ album.publish_date.substring(0, 4) }}</span>
                            </div>
                            <div class="meta-item" v-if="album.song_count">
                                <i class="fas fa-music"></i>
                                <span>{{ album.song_count }}首</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- 专辑分页 -->
            <div class="pagination" v-if="totalAlbums > albumsPerPage">
                <button 
                    class="pagination-btn" 
                    :disabled="currentAlbumPage === 1"
                    @click="currentAlbumPage = 1"
                >
                    <i class="fas fa-angle-double-left"></i>
                </button>
                <button 
                    class="pagination-btn" 
                    :disabled="currentAlbumPage === 1"
                    @click="currentAlbumPage--"
                >
                    <i class="fas fa-angle-left"></i>
                </button>
                <span class="pagination-info">
                    第 {{ currentAlbumPage }} / {{ totalAlbumPages }} 页
                </span>
                <button 
                    class="pagination-btn" 
                    :disabled="currentAlbumPage === totalAlbumPages"
                    @click="currentAlbumPage++"
                >
                    <i class="fas fa-angle-right"></i>
                </button>
                <button 
                    class="pagination-btn" 
                    :disabled="currentAlbumPage === totalAlbumPages"
                    @click="currentAlbumPage = totalAlbumPages"
                >
                    <i class="fas fa-angle-double-right"></i>
                </button>
            </div>
        </div>

        <ContextMenu ref="contextMenuRef" :playerControl="playerControl" @songRemoved="handleSongRemoved" />
        <div class="note-container">
            <transition-group name="fly-note">
                <div v-for="note in flyingNotes" :key="note.id" class="flying-note" :style="note.style">♪</div>
            </transition-group>
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
    </div>
    <PlaylistSelectModal ref="playlistSelect" :current-song="songs"/>
    
    <BatchDownloadManager
        ref="batchDownloadManager"
        :songs="selectedSongs"
        :show-trigger-button="false"
        :batch-artist="isArtist ? (detail.author_name || '') : ''"
        @download-start="handleBatchDownloadStart"
        @download-complete="handleBatchDownloadComplete"
        @download-progress="handleBatchDownloadProgress"
        @song-download-success="handleSongDownloadSuccess"
        @song-download-fail="handleSongDownloadFail"
    />
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount, computed } from 'vue';
import ContextMenu from '../components/ContextMenu.vue';
import PlaylistSelectModal from '../components/PlaylistSelectModal.vue';
import SongActionMenu from '../components/SongActionMenu.vue';
import BatchActionsMenu from '../components/BatchActionsMenu.vue';
import DownloadManager from '../components/DownloadManager.vue';
import BatchDownloadManager from '../components/BatchDownloadManager.vue';
import { get } from '../utils/request';
import { useRoute, useRouter } from 'vue-router';
import { MoeAuthStore } from '../stores/store';
import { useI18n } from 'vue-i18n';
import { share } from '@/utils/utils';
import { downloadWithMetadata } from '../utils/metadata';

const playlistSelect = ref(null);
const { t } = useI18n();
const MoeAuth = MoeAuthStore();
const router = useRouter();
const route = useRoute();
const playerControl = window.playerControl;

// 判断是歌手还是歌单还是专辑
const isArtist = computed(() => !!route.query.singerid);
const isAlbum = computed(() => !!route.query.albumid);

// 通用状态
const detail = ref({});
const tracks = ref([]);
const filteredTracks = ref([]);
const searchQuery = ref('');
const basePageSize = 60; // 基础页面大小
const hasMore = ref(true);
const isLoadingMore = ref(false);
const totalCount = ref(0);
const contextMenuRef = ref(null);
const trackListRef = ref(null);
const loading = ref(true);
const isSearching = ref(false); // 搜索加载状态
const isDropdownVisible = ref(false);
const flyingNotes = ref([]);
let noteId = 0;

// 请求次数追踪，用于计算下一次的pageSize
const requestCount = ref(0);
const currentPage = ref(1);
const artistPageSize = 50;

// 计算下一次请求的pageSize
const getPageSize = () => {
    if (isArtist.value) {
        return artistPageSize;
    }
    if (requestCount.value < 2) {
        return basePageSize;
    } else {
        return Math.min(basePageSize * Math.pow(2, requestCount.value - 1), 240);
    }
};

// 获取下一次请求的page 60 60 120 240 240
const getPage = () => {
    if (isArtist.value) {
        return currentPage.value;
    }
    if (requestCount.value === 0) {
        return 1;
    } else if (requestCount.value <= 3) {
        // pageSize 还在递增阶段 (60, 60, 120, 240)，page 固定为 2
        return 2;
    } else {
        // pageSize 达到最大值 240 后，通过递增 page 继续加载
        // requestCount=4 时 page=3, requestCount=5 时 page=4, ...
        return requestCount.value - 1;
    }
};

// 歌手特有状态
const isFollowed = ref(true);
const followLoading = ref(false);
const collectedPlaylists = ref([]);
// 判断歌单是否被收藏
const isPlaylistFavorited = ref(false);

// 更新收藏状态
const updateFavoriteStatus = () => {
    if (!detail.value.list_create_listid) {
        isPlaylistFavorited.value = false;
        return;
    }
    collectedPlaylists.value = JSON.parse(localStorage.getItem('collectedPlaylists') || '[]');
    isPlaylistFavorited.value = collectedPlaylists.value.some(item => item.list_create_listid === detail.value.list_create_listid);
};

// 批量选择相关状态
const batchSelectionMode = ref(false);
const isBatchMenuVisible = ref(false);
const selectedTracks = ref([]);
let lastSelectedIndex = -1;
const songs = ref([]);

// 批量下载相关状态
const batchDownloadManager = ref(null);
const selectedSongs = computed(() => {
    if (selectedTracks.value.length === 0) return [];
    return selectedTracks.value.map(index => filteredTracks.value[index]);
});

// 更多菜单相关状态
const showMoreMenu = ref(false);
const selectedSong = ref(null);

// 排序状态
const sortField = ref('');
const sortOrder = ref('asc');
const artistSortType = ref('hot'); // 歌手歌曲排序类型：hot(热门) 或 new(最新)

// 专辑相关状态
const activeTab = ref(route.query.tab || 'songs'); // 当前标签：songs 或 albums
const albums = ref([]); // 专辑列表
const albumsLoading = ref(false); // 专辑加载状态
const currentAlbumPage = ref(1); // 专辑当前页
const albumsPerPage = ref(30); // 专辑每页数量
const totalAlbums = ref(0); // 专辑总数

// 判断是否全选
const isAllSelected = computed(() => {
    return selectedTracks.value.length === filteredTracks.value.length && filteredTracks.value.length > 0;
});

// 视图模式相关状态
const viewMode = ref('list'); // 'list' or 'grid'

// 计算显示的歌曲数量
const displayTrackCount = computed(() => {
    // 当还有更多数据未加载时，显示 totalCount；否则显示实际加载的 tracks.length
    return hasMore.value ? totalCount.value : tracks.value.length;
});

// 计算专辑总页数
const totalAlbumPages = computed(() => {
    return Math.ceil(totalAlbums.value / albumsPerPage.value);
});

// 计算歌手歌曲总页数
const totalArtistPages = computed(() => {
    return Math.ceil(totalCount.value / artistPageSize);
});

// 跳转到指定页
const goToArtistPage = (page) => {
    if (page < 1 || page > totalArtistPages.value) return;
    currentPage.value = page;
    fetchArtistSongsByPage();
};

// 获取指定页的歌手歌曲
const fetchArtistSongsByPage = async () => {
    tracks.value = [];
    filteredTracks.value = [];
    loading.value = true;

    try {
        const response = await get('/artist/audios', {
            id: route.query.singerid,
            sort: artistSortType.value,
            page: currentPage.value,
            pagesize: artistPageSize
        });

        if (response.status === 1) {
            totalCount.value = detail.value.song_count || 0;
            const rawSongs = response.data || [];
            const formattedTracks = rawSongs
            .filter(track => !!track.hash)
            .map(track => ({
                hash: track.hash || '',
                remark: track.remark || '',
                OriSongName: track.audio_name + ' - ' + track.author_name,
                name: track.audio_name || '',
                author: track.author_name || '',
                album: track.album_name || '',
                cover: track.trans_param.union_cover?.replace("{size}", 480) || '',
                timelen: track.timelength || 0,
                isSQ: track.hash_flac !== '',
                isHQ: track.hash_320 !== '',
                privilege: track.privilege || 0,
                mvhash: track.mvhash || '',
                originalData: track
            }));

            tracks.value = formattedTracks;
            filteredTracks.value = formattedTracks;
        }
    } catch (error) {
        window.$modal.alert(t('ge-qu-shu-ju-cuo-wu'));
    }

    loading.value = false;
};

// 计算歌单封面图
const playlistCover = computed(() => {
    if (detail.value.pic) {
        return detail.value.pic;
    }
    if (detail.value.img) {
        return detail.value.img;
    }
    if (tracks.value.length > 0 && tracks.value[0].cover) {
        return tracks.value[0].cover;
    }
    return null;
});

const props = defineProps({
    playerControl: Object
});

onMounted(() => {
    isFollowed.value = !!route.query.unfollow;
    loadData();
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', handleScroll);
});

onBeforeUnmount(() => {
    document.removeEventListener('click', handleClickOutside);
    window.removeEventListener('scroll', handleScroll);
});

watch(() => [route.query.global_collection_id, route.query.singerid, route.query.albumid, route.query.tab], () => {
    // 只在歌单详情页时才加载数据
    if (route.path.toLowerCase() === '/playlistdetail') {
        loadData();
        // 更新当前标签状态
        if (route.query.tab) {
            activeTab.value = route.query.tab;
        }
    }
});

// 监听专辑页码变化
watch(currentAlbumPage, () => {
    if (isArtist.value && activeTab.value === 'albums') {
        fetchArtistAlbums();
    }
});

const loadData = async () => {
    if(!route.query.global_collection_id && !route.query.singerid && !route.query.albumid) {
        router.push('/library');
        return;
    }
    if (isArtist.value) {
        getArtistInfo();
        fetchArtistSongs();
        fetchArtistAlbums();
    } else if (isAlbum.value) {
        getAlbumInfo();
        fetchAlbumSongs();
    } else {
        updateFavoriteStatus();
        await fetchPlaylistTracks();
    }
};

// 切换标签
const switchTab = (tab) => {
    activeTab.value = tab;
    router.replace({
        query: {
            ...route.query,
            tab: tab
        }
    });
    if (tab === 'albums' && albums.value.length === 0) {
        fetchArtistAlbums();
    }
};

// 获取歌手信息
const getArtistInfo = async () => {
    try {
        const response = await get('/artist/detail', {
            id: route.query.singerid
        });
        if (response.status === 1) {
            detail.value = {
                ...response.data,
                id: route.query.singerid
            };
        }
    } catch (error) {
        console.error('获取歌手信息失败:', error);
    }
};

// 获取专辑信息
const getAlbumInfo = async () => {
    try {
        const response = await get('/album/detail', {
            id: route.query.albumid
        });
        if (response.status === 1 && response.data && response.data.length > 0) {
            const albumData = response.data[0];
            detail.value = {
                name: albumData.album_name || '',
                author_name: albumData.author_name || '',
                pic: albumData.sizable_cover || albumData.cover || '',
                publish_date: albumData.publish_date || '',
                intro: albumData.intro || '',
                song_count: 0,
                id: route.query.albumid
            };
        }
    } catch (error) {
        console.error('获取专辑信息失败:', error);
    }
};

// 获取歌手歌曲
const fetchArtistSongs = async () => {
    currentPage.value = 1;
    await fetchArtistSongsByPage();
};

// 获取歌手专辑
const fetchArtistAlbums = async () => {
    albumsLoading.value = true;
    try {
        const response = await get('/artist/albums', {
            id: route.query.singerid,
            page: currentAlbumPage.value,
            pagesize: albumsPerPage.value,
            sort: 'new'
        });

        if (response.status === 1) {
            const rawAlbums = response.data || [];
            albums.value = rawAlbums;
            totalAlbums.value = response.extra?.page_total || rawAlbums.length;
        }
    } catch (error) {
        console.error('获取歌手专辑失败:', error);
        window.$modal.alert('获取专辑失败');
    } finally {
        albumsLoading.value = false;
    }
};

// 获取专辑歌曲
const fetchAlbumSongs = async () => {
    requestCount.value = 0;
    hasMore.value = true;
    tracks.value = []; // 清空之前的歌曲数据
    filteredTracks.value = []; // 清空之前的筛选数据

    try {
        const albumPageSize = 50; // 专辑固定使用 pagesize=50
        const curPage = 1;

        const response = await get('/album/songs', {
            id: route.query.albumid,
            page: curPage,
            pagesize: albumPageSize
        });

        if (response.status === 1) {
            totalCount.value = response.data.total || 0;
            // 更新专辑歌曲数量
            if (detail.value.song_count === 0) {
                detail.value.song_count = response.data.total || 0;
            }
            const rawSongs = response.data.songs || [];
            const formattedTracks = rawSongs
            .filter(track => track.audio_info?.hash)
            .map(track => {
                const audioInfo = track.audio_info;
                const base = track.base;
                const albumInfo = track.album_info;
                const mvHash = track.mvdata && track.mvdata.length > 0 ? track.mvdata[0].hash : '';

                return {
                    hash: audioInfo.hash || '',
                    remark: track.extra?.remark || '',
                    OriSongName: base.audio_name + ' - ' + base.author_name,
                    name: base.audio_name || '',
                    author: base.author_name || '',
                    album: albumInfo?.album_name || '',
                    cover: track.trans_param?.union_cover?.replace("{size}", 480) || '',
                    timelen: audioInfo.duration || 0,
                    isSQ: !!audioInfo.hash_flac,
                    isHQ: !!audioInfo.hash_320,
                    privilege: track.copyright?.privilege || 0,
                    mvhash: mvHash,
                    originalData: track
                };
            });

            tracks.value = formattedTracks;
            filteredTracks.value = formattedTracks;
            requestCount.value++; // 增加请求计数

            // 判断是否还有更多数据
            hasMore.value = rawSongs.length >= albumPageSize && tracks.value.length < totalCount.value;
        }
    } catch (error) {
        window.$modal.alert(t('ge-qu-shu-ju-cuo-wu'));
        return;
    }

    loading.value = false;

    ensureBufferData();
};

// 获取歌单歌曲
const fetchPlaylistTracks = async () => {
    requestCount.value = 0; // 重置请求计数
    hasMore.value = true;
    tracks.value = []; // 清空之前的歌曲数据
    filteredTracks.value = []; // 清空之前的筛选数据

    try {
        const curPage = getPage();
        const curPageSize = getPageSize();

        const response = await get('/playlist/track/all', {
            id: route.query.global_collection_id,
            page: curPage,
            pagesize: curPageSize
        });

        if (response.status === 1) {
            detail.value = response.data?.list_info;
            totalCount.value = detail.value.count || 0;
            const rawSongs = response.data?.songs || [];
            const formattedTracks = rawSongs
            .filter(track => !!track.hash)
            .map(track => {
                const nameParts = track.name.split(' - ');
                return {
                    hash: track.hash || '',
                    remark: track.remark || '',
                    OriSongName: track.name,
                    name: nameParts.length > 1 ? nameParts[1] : track.name,
                    author: nameParts.length > 1 ? nameParts[0] : '',
                    album: track.albuminfo?.name || '',
                    cover: track.cover?.replace("{size}", 480) || '',
                    timelen: track.timelen || 0,
                    isSQ: track.relate_goods && track.relate_goods.length > 2,
                    isHQ: track.relate_goods && track.relate_goods.length > 1,
                    privilege: track.privilege || 0,
                    mvhash: track.mvhash || '',
                    originalData: track
                };
            });

            tracks.value = formattedTracks;
            filteredTracks.value = formattedTracks;
            requestCount.value++; // 增加请求计数
            hasMore.value = rawSongs.length >= curPageSize && tracks.value.length < totalCount.value;
        }
    } catch (error) {
        window.$modal.alert(t('ge-qu-shu-ju-cuo-wu'));
        return;
    }

    loading.value = false;

    ensureBufferData();
};

// 加载更多歌曲
const loadMoreTracks = async () => {
    if (isLoadingMore.value || !hasMore.value) return;

    isLoadingMore.value = true;

    try {
        if (isArtist.value) {
            // 加载更多歌手歌曲
            const curPage = getPage();
            const curPageSize = getPageSize();

            const response = await get('/artist/audios', {
                id: route.query.singerid,
                sort: artistSortType.value,
                page: curPage,
                pagesize: curPageSize
            });

            if (response.status === 1 && response.data.length > 0) {
                const rawSongs = response.data;
                const formattedTracks = rawSongs
                .filter(track => !!track.hash)
                .map(track => ({
                    hash: track.hash || '',
                    remark: track.remark || '',
                    OriSongName: track.audio_name + ' - ' + track.author_name,
                    name: track.audio_name || '',
                    author: track.author_name || '',
                    album: track.album_name || '',
                    cover: track.trans_param.union_cover?.replace("{size}", 480) || '',
                    timelen: track.timelength || 0,
                    isSQ: track.hash_flac !== '',
                    isHQ: track.hash_320 !== '',
                    privilege: track.privilege || 0,
                    mvhash: track.mvhash || '',
                    originalData: track
                }));

                tracks.value = [...tracks.value, ...formattedTracks];
                filteredTracks.value = tracks.value;
                requestCount.value++;
                currentPage.value++;
                hasMore.value = rawSongs.length >= curPageSize && tracks.value.length < totalCount.value;
            } else {
                hasMore.value = false;
            }
        } else if (isAlbum.value) {
            // 加载更多专辑歌曲
            const albumPageSize = 50; // 专辑固定使用 pagesize=50
            const curPage = Math.floor(tracks.value.length / albumPageSize) + 1;

            const response = await get('/album/songs', {
                id: route.query.albumid,
                page: curPage,
                pagesize: albumPageSize
            });

            if (response.status === 1 && response.data.songs?.length > 0) {
                const rawSongs = response.data.songs;
                const formattedTracks = rawSongs
                .filter(track => track.audio_info?.hash)
                .map(track => {
                    const audioInfo = track.audio_info;
                    const base = track.base;
                    const albumInfo = track.album_info;
                    const mvHash = track.mvdata && track.mvdata.length > 0 ? track.mvdata[0].hash : '';

                    return {
                        hash: audioInfo.hash || '',
                        remark: track.extra?.remark || '',
                        OriSongName: base.audio_name + ' - ' + base.author_name,
                        name: base.audio_name || '',
                        author: base.author_name || '',
                        album: albumInfo?.album_name || '',
                        cover: track.trans_param?.union_cover?.replace("{size}", 480) || '',
                        timelen: audioInfo.duration || 0,
                        isSQ: !!audioInfo.hash_flac,
                        isHQ: !!audioInfo.hash_320,
                        privilege: track.copyright?.privilege || 0,
                        mvhash: mvHash,
                        originalData: track
                    };
                });

                tracks.value = [...tracks.value, ...formattedTracks];
                filteredTracks.value = tracks.value;
                requestCount.value++; // 增加请求计数
                hasMore.value = rawSongs.length >= albumPageSize && tracks.value.length < totalCount.value;
            } else {
                hasMore.value = false;
            }
        } else {
            // 加载更多歌单歌曲
            const curPage = getPage();
            const curPageSize = getPageSize();

            const response = await get('/playlist/track/all', {
                id: route.query.global_collection_id,
                page: curPage,
                pagesize: curPageSize
            });

            if (response.status === 1 && response.data.songs?.length > 0) {
                const rawSongs = response.data.songs;
                const formattedTracks = rawSongs
                .filter(track => !!track.hash)
                .map(track => {
                    const nameParts = track.name.split(' - ');
                    return {
                        hash: track.hash || '',
                        OriSongName: track.name,
                        name: nameParts.length > 1 ? nameParts[1] : track.name,
                        author: nameParts.length > 1 ? nameParts[0] : '',
                        album: track.albuminfo?.name || '',
                        cover: track.cover?.replace("{size}", 480) || '',
                        timelen: track.timelen || 0,
                        isSQ: track.relate_goods && track.relate_goods.length > 2,
                        isHQ: track.relate_goods && track.relate_goods.length > 1,
                        privilege: track.privilege || 0,
                        mvhash: track.mvhash || '',
                        originalData: track
                    };
                });

                tracks.value = [...tracks.value, ...formattedTracks];
                filteredTracks.value = tracks.value;
                requestCount.value++; // 增加请求计数
                hasMore.value = rawSongs.length >= curPageSize && tracks.value.length < totalCount.value;
            } else {
                hasMore.value = false;
            }
        }
    } catch (error) {
        console.error('加载更多歌曲失败:', error);
        hasMore.value = false; // 出错时停止继续加载，防止循环重试
    } finally {
        isLoadingMore.value = false;
        // 加载完成后继续检查是否需要加载更多以保持3页缓冲
        ensureBufferData();
    }
};

// 记录最后的滚动位置信息
let lastVisibleBottomIndex = 0;

// 确保始终有足够的缓冲数据
const ensureBufferData = () => {
    const totalItems = filteredTracks.value.length;
    const remainingItems = totalItems - lastVisibleBottomIndex;
    const bufferSize = 90;

    if (remainingItems < bufferSize && hasMore.value && !isLoadingMore.value) {
        loadMoreTracks();
    }
};

const handleScroll = () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;
    
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    
    if (distanceToBottom < 300 && hasMore.value && !isLoadingMore.value) {
        loadMoreTracks();
    }
};

// 搜索歌曲
const searchTracks = async () => {
    if (hasMore.value) {
        isSearching.value = true;
        try {
            await loadAndAppendRemainingTracks();
        } finally {
            isSearching.value = false;
        }
    }
    filteredTracks.value = tracks.value.filter(track =>
        track.name.toLowerCase().trim().includes(searchQuery.value.toLowerCase().trim()) ||
        track.author.toLowerCase().trim().includes(searchQuery.value.toLowerCase().trim())
    );
};

// 播放歌曲
const playSong = (hash, name, img, author, timelen, extraData) => {
    if (window.playerControl && window.playerControl.addSongToQueue) {
        window.playerControl.addSongToQueue(hash, name, img, author, timelen, extraData);
    } else if (props.playerControl && props.playerControl.addSongToQueue) {
        props.playerControl.addSongToQueue(hash, name, img, author, timelen, extraData);
    } else {
        console.warn('playerControl is not available');
    }
};

// 加载所有剩余歌曲并追加到播放队列
const loadAndAppendRemainingTracks = async () => {
    const loadedHashes = new Set(filteredTracks.value);

    while (hasMore.value) {
        if (isLoadingMore.value) {
            // 等待当前加载完成
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
        }
        await loadMoreTracks();
        // 找出新加载的歌曲（不在之前已加载集合中的）
        const newTracks = filteredTracks.value.filter(t => !loadedHashes.has(t));
        if (newTracks.length > 0) {
            // 将新歌曲追加到播放队列
            props.playerControl.addPlaylistToQueue(newTracks, true);
            // 更新已加载集合
            newTracks.forEach(t => {
                loadedHashes.add(t);
            });
        }
    }
};

// 添加整个播放列表到队列
const addPlaylistToQueue = (event, append = false) => {
    const playButton = event.currentTarget;
    const rect = playButton.getBoundingClientRect();
    const note = {
        id: noteId++,
        style: {
            '--start-x': `${rect.left + rect.width/2}px`,
            '--start-y': `${rect.top + rect.height/2}px`,
            'left': '0',
            'top': '0'
        }
    };
    flyingNotes.value.push(note);
    setTimeout(() => {
        flyingNotes.value = flyingNotes.value.filter(n => n.id !== note.id);
    }, 1500);

    // 先将当前已加载的歌曲加入播放队列并开始播放
    props.playerControl.addPlaylistToQueue(filteredTracks.value, append);

    // 如果还有未加载的歌曲，后台继续加载并追加到队列
    if (hasMore.value) {
        loadAndAppendRemainingTracks();
    }
};

// 切换关注状态
const toggleFollow = async () => {
    if (!MoeAuth.isAuthenticated) {
        window.$modal.alert(t('qing-xian-deng-lu'));
        return;
    }
    followLoading.value = true;
    try {
        const response = await get(isFollowed.value ? '/artist/unfollow' : '/artist/follow', {
            id: route.query.singerid
        });
        if (response.status === 1) {
            isFollowed.value = !isFollowed.value;
        }
    } catch (error) {
        console.error('切换关注状态失败:', error);
    } finally {
        followLoading.value = false;
        localStorage.setItem('t', Date.now());
    }
};

// 收藏歌单
const toggleFavorite = async (id) => {
    if (!MoeAuth.isAuthenticated) {
        window.$modal.alert(t('qing-xian-deng-lu'));
        return;
    }
    
    try {
        if (isPlaylistFavorited.value) {
            const playlist = collectedPlaylists.value.find(p => p.list_create_listid === detail.value.list_create_listid);
            if (playlist) {
                await get('/playlist/del', { listid: playlist.listid });
                const newCollectedPlaylists = collectedPlaylists.value.filter(item => 
                    item.list_create_listid !== detail.value.list_create_listid
                );
                localStorage.setItem('collectedPlaylists', JSON.stringify(newCollectedPlaylists));
                isPlaylistFavorited.value = false;
                $message.success('取消收藏成功');
            }
        } else {
            const response = await get('/playlist/add', { 
                name: detail.value.name, 
                list_create_userid: MoeAuth.UserInfo.userid, 
                type: 1,
                list_create_gid: id 
            });
            if (response.status === 1) {
                const newPlaylist = {
                    list_create_listid: detail.value.list_create_listid,
                    listid: response.data.info.listid
                };
                const currentPlaylists = JSON.parse(localStorage.getItem('collectedPlaylists') || '[]');
                currentPlaylists.push(newPlaylist);
                localStorage.setItem('collectedPlaylists', JSON.stringify(currentPlaylists));
                isPlaylistFavorited.value = true;
                $message.success('收藏成功');
            }
        }
        localStorage.setItem('t', Date.now());
    } catch (error) {
        $message.error(isPlaylistFavorited.value ? t('qu-xiao-shou-cang-shi-bai') : t('shou-cang-shi-bai'));
    }
};

// 删除歌单
const deletePlaylist = async () => {
    isDropdownVisible.value = false;
    const result = await window.$modal.confirm(t('que-ren-shan-chu-ge-dan'));
    if (result) {
        await get('/playlist/del', { listid: route.query.listid });
        localStorage.setItem('t', Date.now());
        router.back();
    }
};

// 编辑歌单
const editPlaylist = async () => {
    const result = await window.$modal.prompt(t('qing-shu-ru-xin-de-ge-dan-ming-cheng'), detail.value.name);
    if (result && result !== detail.value.name) {
        try {
            const response = await get('/playlist/add', { 
                name: result, 
                list_create_userid: MoeAuth.UserInfo.userid,
                list_create_listid: detail.value.list_create_listid,
                list_create_gid: detail.value.list_create_gid,
                type: 0
            });
            if (response.status === 1) {
                detail.value.name = result;
                localStorage.setItem('t', Date.now());
                window.$modal.alert('歌单名称修改成功');
            }
        } catch (error) {
            window.$modal.alert('修改歌单名称失败');
        }
    }
};

// 分享歌单
const sharePlaylist = () => {
    isDropdownVisible.value = false;
    share(detail.value.name,route.query.global_collection_id, 1);
};

// 右键菜单
const showContextMenu = (event, song) => {
    event.stopPropagation();
    selectedSong.value = song;
    showMoreMenu.value = true;
};

const closeMoreMenu = () => {
    showMoreMenu.value = false;
};

const handleAddToPlaylist = (song) => {
    if (song && window.playerControl) {
        window.playerControl.addSongToQueue(
            song.hash,
            song.name,
            song.cover,
            song.author
        );
    }
};

const handlePlayNow = (song) => {
    if (song) {
        playSong(song.hash, song.name, song.cover, song.author, 0, { album_name: song.album_name, album_id: song.album_id, publish_date: song.publish_date });
    }
};

const handleDownloadStart = (song, quality) => {
    console.log('下载开始:', song.name, '音质:', quality.name);
};

const handleDownloadComplete = (song, url, quality) => {
    console.log('下载完成:', song.name);
    selectedSong.value = null;
};

const handleDownloadFail = (song, error) => {
    console.error('下载失败:', error.message);
    selectedSong.value = null;
};

const handleQualitySelect = (quality) => {
    console.log('选择音质:', quality.name);
};

// 跳转到专辑详情
const goToAlbumDetail = (album) => {
    console.log('跳转到专辑详情:', album);
    const albumId = album.album_id || album.id;
    if (albumId) {
        router.push({
            path: '/PlaylistDetail',
            query: {
                albumid: albumId
            }
        });
    }
};

const goToBatchDownload = () => {
    router.push({
        path: '/download',
        query: {
            artistId: route.query.singerid
        }
    });
};



// 处理下拉菜单点击外部关闭
const handleClickOutside = (event) => {
    const dropdown = document.querySelector('.dropdown-menu');
    const moreBtn = document.querySelector('.more-btn');
    if (dropdown && !dropdown.contains(event.target) && !moreBtn.contains(event.target)) {
        isDropdownVisible.value = false;
    }
    
    // 处理批量操作菜单
    const batchActionsMenu = document.querySelector('.batch-actions-menu');
    const batchActionBtns = document.querySelectorAll('.batch-action-btn');
    const clickedOnBatchBtn = Array.from(batchActionBtns).some(btn => btn.contains(event.target));
    if (batchActionsMenu && !batchActionsMenu.contains(event.target) && !clickedOnBatchBtn) {
        isBatchMenuVisible.value = false;
    }
};

// 切换下拉菜单显示状态
const toggleDropdown = () => {
    isDropdownVisible.value = !isDropdownVisible.value;
};

// 切换批量选择模式
const toggleBatchSelection = () => {
    if (batchSelectionMode.value) {
        // 退出批量选择模式
        batchSelectionMode.value = false;
        isBatchMenuVisible.value = false;
        selectedTracks.value = [];
        lastSelectedIndex = -1;
    } else {
        // 进入批量选择模式
        batchSelectionMode.value = true;
        isBatchMenuVisible.value = false;
    }
};

// 切换批量操作菜单显示状态
const toggleBatchMenu = () => {
    isBatchMenuVisible.value = !isBatchMenuVisible.value;
};

// 选择/取消选择歌曲
const selectTrack = (index, event) => {
    if (event.shiftKey && lastSelectedIndex !== -1) {
        // Shift 键多选
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        
        for (let i = start; i <= end; i++) {
            if (!selectedTracks.value.includes(i)) {
                selectedTracks.value.push(i);
            }
        }
    } else {
        // 普通点击
        const existingIndex = selectedTracks.value.indexOf(index);
        if (existingIndex === -1) {
            selectedTracks.value.push(index);
        } else {
            selectedTracks.value.splice(existingIndex, 1);
        }
    }
    
    lastSelectedIndex = index;
};

// 将选中歌曲添加到播放队列（追加到当前队列）
const appendSelectedToQueue = async () => {
    if (selectedTracks.value.length === 0) return;
    const selectedSongs = selectedTracks.value.map(index => filteredTracks.value[index]);
    if (window.playerControl && window.playerControl.addPlaylistToQueue) {
        await window.playerControl.addPlaylistToQueue(selectedSongs, true);
        $message.success('添加到播放列表成功');
    } else if (props.playerControl && props.playerControl.addPlaylistToQueue) {
        await props.playerControl.addPlaylistToQueue(selectedSongs, true);
        $message.success('添加到播放列表成功');
    } else {
        console.warn('playerControl is not available');
        $message.error('播放器控制不可用');
    }
    isBatchMenuVisible.value = false;
};

// 将选中歌曲添加到其他歌单
const addSelectedToOtherPlaylist = async () => {
    if (selectedTracks.value.length === 0) return;
    const selectedSongs = selectedTracks.value.map(index => filteredTracks.value[index]);
    songs.value =  selectedSongs;
    await playlistSelect.value.fetchPlaylists();
    isBatchMenuVisible.value = false;
};

// 从歌单中移除选中的歌曲
const removeSelectedFromPlaylist = async () => {
    if (selectedTracks.value.length === 0) return;
    const result = await window.$modal.confirm('确定要移除选中的歌曲吗？');
    if (result) {
        const selectedSongs = selectedTracks.value.map(index => filteredTracks.value[index]);
        try {
            const fileids = selectedSongs.map(song => song.originalData.fileid).join(',');
            await get('/playlist/tracks/del', {
                listid: route.query.listid,
                fileids: fileids
            });
            selectedTracks.value.sort((a, b) => b - a).forEach(index => {
                filteredTracks.value.splice(index, 1);
                tracks.value = tracks.value.filter((_, i) => 
                    !selectedTracks.value.includes(i)
                );
            });
            filteredTracks.value = tracks.value;
            selectedTracks.value = [];
            $message.success('歌曲已从歌单中移除');
        } catch (err) {
            $message.error('移除歌曲失败');
            return;
        }
    }
    isBatchMenuVisible.value = false;
};

const handleBatchDownloadStart = (songs, quality) => {
    $message.info(`开始批量下载 ${songs.length} 首歌曲，音质：${quality.name}`);
};

const handleBatchDownloadComplete = (songs, quality) => {
    $message.success('批量下载完成');
};

const handleBatchDownloadProgress = (progress) => {
    console.log('下载进度:', progress);
};

const handleSongDownloadSuccess = (song, index) => {
    $message.success(`下载成功 (${index}): ${song.name}`);
};

const handleSongDownloadFail = (song, index, error) => {
    console.error(`下载失败: ${song.name}`, error);
    $message.error(`下载失败: ${song.name}`);
};

const handleBatchDownload = () => {
    if (selectedTracks.value.length === 0) return;
    if (batchDownloadManager.value) {
        batchDownloadManager.value.openQualityModal();
    }
};

const handleBatchMenuClose = () => {
    isBatchMenuVisible.value = false;
};

// 切换全选/取消全选
const toggleSelectAll = () => {
    if (isAllSelected.value) {
        selectedTracks.value = [];
    } else {
        selectedTracks.value = Array.from({ length: filteredTracks.value.length }, (_, i) => i);
    }
};

// 根据字段排序
const sortTracks = async (field) => {
    if (hasMore.value) {
        isSearching.value = true;
        try {
            await loadAndAppendRemainingTracks();
        } finally {
            isSearching.value = false;
        }
    }
    if (sortField.value === field) {
        sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortField.value = field;
        sortOrder.value = 'asc';
    }
    
    filteredTracks.value = [...filteredTracks.value].sort((a, b) => {
        let valueA, valueB;
        
        if (field === 'timelen') {
            valueA = a[field] || 0;
            valueB = b[field] || 0;
        } else {
            valueA = (a[field] || '').toLowerCase();
            valueB = (b[field] || '').toLowerCase();
        }
        
        if (sortOrder.value === 'asc') {
            return valueA > valueB ? 1 : -1;
        } else {
            return valueA < valueB ? 1 : -1;
        }
    });
    
    if (batchSelectionMode.value) {
        selectedTracks.value = [];
    }
};

const getSortIconClass = (field) => {
    if (sortField.value !== field) {
        return 'fa-sort';
    }
    return sortOrder.value === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
};

const handleSongRemoved = (fileid) => {
    tracks.value = tracks.value.filter(track => track.originalData?.fileid !== fileid);
    filteredTracks.value = filteredTracks.value.filter(track => track.originalData?.fileid !== fileid);
};



// 切换歌手歌曲排序方式
const changeArtistSort = (sortType) => {
    if (artistSortType.value !== sortType) {
        artistSortType.value = sortType;
        // 重新获取歌手歌曲
        fetchArtistSongs();
    }
};

// 判断是否为当前歌曲（不管是否正在播放）
const isCurrentSong = (hash) => {
    return props.playerControl?.currentSong?.hash === hash;
};

// 判断是否为当前正在播放的歌曲
const isCurrentPlaying = (hash) => {
    return isCurrentSong(hash) && props.playerControl?.playing;
};
</script>

<style scoped>
.detail-page {
    padding: 20px;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

/* 头部样式 */
.header {
    display: flex;
    align-items: center;
    margin-bottom: 40px;
}

/* 标签切换样式 */
.tab-container {
    display: flex;
    gap: 6px;
    margin-bottom: 15px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    padding: 4px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.tab-item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: #666;
    transition: all 0.3s;
}

.tab-item:hover {
    background: rgba(102, 126, 234, 0.1);
    color: #667eea;
}

.tab-item.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.tab-item i {
    font-size: 14px;
}

/* 专辑列表样式 */
.album-list-container {
}

.loading-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #666;
}

.loading-overlay i {
    font-size: 32px;
    margin-bottom: 10px;
}

.loading-overlay span {
    font-size: 14px;
}

.album-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 20px;
}

.album-card {
    display: flex;
    flex-direction: column;
    background-color: rgba(255, 255, 255, 0.95);
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    transition: transform 0.3s, box-shadow 0.3s;
    cursor: pointer;
    height: 100%;
}

.album-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
}

.album-cover {
    position: relative;
    width: 100%;
    padding-top: 100%;
    overflow: hidden;
}

.cover-placeholder {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
}

.cover-placeholder i {
    font-size: 60px;
    color: white;
}

.album-cover img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.5s;
}

.album-card:hover .album-cover img {
    transform: scale(1.05);
}

.album-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.3);
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0;
    transition: opacity 0.3s;
}

.album-card:hover .album-overlay {
    opacity: 1;
}

.play-button {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background-color: var(--primary-color, #667eea);
    border: none;
    color: white;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: transform 0.2s, background-color 0.2s;
}

.play-button:hover {
    transform: scale(1.1);
    background-color: #d81e06;
}

.play-button i {
    font-size: 20px;
}

.album-info {
    padding: 10px;
    display: flex;
    flex-direction: column;
    flex: 1;
}

.album-name {
    font-size: 14px;
    font-weight: bold;
    margin: 0 0 4px 0;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.album-artist {
    font-size: 12px;
    color: #666;
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.album-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: auto;
}

.meta-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #888;
    background-color: #f5f5f5;
    padding: 4px 8px;
    border-radius: 4px;
}

.meta-item i {
    font-size: 12px;
    color: var(--primary-color, #667eea);
}

/* 分页样式 */
.pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 20px;
    padding: 15px;
}

.pagination-btn {
    width: 40px;
    height: 40px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s;
}

.pagination-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.1);
}

.pagination-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.pagination-info {
    font-size: 14px;
    color: white;
    min-width: 100px;
    text-align: center;
}

/* 移动端适配 */
@media (max-width: 768px) {
    .header {
        flex-direction: row;
        align-items: flex-start;
        margin-bottom: 30px;
        flex-wrap: nowrap;
    }
    
    .cover-art {
        width: 140px;
        height: 140px;
        margin-right: 15px;
        margin-bottom: 0;
    }
    
    .info {
        max-width: calc(100% - 155px);
        flex: 1;
        overflow: hidden;
    }
    
    .title {
        font-size: 16px;
        width: 100%;
        -webkit-line-clamp: 2;
        word-wrap: break-word;
        white-space: normal;
    }
    
    .subtitle {
        font-size: 12px;
        margin: 4px 0;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .meta {
        font-size: 12px;
        margin-bottom: 8px;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .stats {
        font-size: 12px;
        gap: 8px;
        flex-wrap: wrap;
    }
    
    .description {
        font-size: 12px;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    
    /* 标签切换移动端适配 */
    .tab-container {
        flex-direction: row;
        gap: 5px;
        padding: 3px;
        margin-bottom: 15px;
    }
    
    .tab-item {
        font-size: 14px;
        padding: 10px 12px;
        gap: 6px;
    }
    
    .tab-item i {
        font-size: 16px;
    }
    
    /* 专辑列表移动端适配 */
    .album-grid {
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 15px;
    }
    
    .album-name {
        font-size: 14px;
    }
    
    .album-artist {
        font-size: 12px;
    }
    
    .meta-item {
        font-size: 10px;
        padding: 3px 6px;
    }
    
    /* 分页移动端适配 */
    .pagination {
        gap: 8px;
        padding: 12px;
    }
    
    .pagination-btn {
        width: 35px;
        height: 35px;
    }
    
    .pagination-info {
        font-size: 12px;
        min-width: 80px;
    }
    
    .description {
        font-size: 12px;
        max-height: 80px;
        margin-bottom: 15px;
        padding: 8px;
        width: 100%;
        word-wrap: break-word;
        white-space: normal;
    }
    
    .actions {
        justify-content: flex-start;
        gap: 8px;
    }
    
    .primary-btn {
        padding: 8px 20px;
        font-size: 14px;
    }
    
    .track-list-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
    }
    
    .track-list-header-bottom {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        width: 100%;
    }
    
    .track-list-actions-left {
        flex-wrap: wrap;
        width: 100%;
    }
    
    .batch-action-container {
        flex-wrap: wrap;
    }
    
    .track-list-actions-right {
        width: 100%;
    }
    
    .search-input {
        width: 100%;
    }
    
    /* 默认桌面端字体大小 */
.track-list-header-row {
    font-size: 14px;
}

.track-actions-header {
    font-size: 14px;
    font-weight: bold;
    color: white;
}

.track-title {
    font-size: 16px;
}

.track-remark {
    font-size: 12px;
}

.track-artist {
    font-size: 16px;
}

.track-album {
    font-size: 16px;
}

.track-timelen {
    font-size: 16px;
}

.track-number {
    font-size: 16px;
}

.track-number.current {
    font-size: 18px;
}

.track-number-header {
    font-size: 14px;
}

.track-title-header, .track-artist-header, .track-album-header, .track-timelen-header {
    font-size: 14px;
    font-weight: bold;
}

.track-title-header i, .track-artist-header i, .track-album-header i, .track-timelen-header i {
    font-size: 12px;
}

/* 表格列分布 */
.track-number-header {
    flex: 5;
    min-width: 20px;
    justify-content: flex-start;
}

.track-title-header {
    flex: 31;
    justify-content: flex-start;
    text-align: left;
}

.track-artist-header, .track-album-header {
    flex: 24;
    justify-content: flex-start;
    text-align: left;
}

.track-timelen-header {
    flex: 6;
    justify-content: flex-end;
}

.track-actions-header {
    flex: 10;
    justify-content: flex-end;
}

.track-actions {
    flex: 10;
    justify-content: flex-end;
}

/* 平板设备适配 */
@media (max-width: 768px) {
    .track-list-header-row {
        font-size: 12px;
    }
    
    .track-actions-header {
        font-size: 12px;
    }
    
    .track-title {
        font-size: 14px;
    }
    
    .track-remark {
        font-size: 11px;
    }
    
    .track-artist {
        font-size: 14px;
    }
    
    .track-album {
        font-size: 14px;
    }
    
    .track-timelen {
        font-size: 14px;
    }
    
    .track-number {
        font-size: 14px;
    }
    
    .track-number.current {
        font-size: 16px;
    }
    
    .track-number-header {
        font-size: 12px;
    }
    
    .track-title-header, .track-artist-header, .track-album-header, .track-timelen-header {
        font-size: 12px;
    }
    
    .track-title-header i, .track-artist-header i, .track-album-header i, .track-timelen-header i {
        font-size: 10px;
    }
}

/* 手机设备适配 */
@media (max-width: 480px) {
    .track-list-header-row {
        font-size: 10px;
    }
    
    .track-actions-header {
        font-size: 10px;
    }
    
    .track-title {
        font-size: 10px;
    }
    
    .track-remark {
        font-size: 9px;
    }
    
    .track-artist {
        font-size: 10px;
    }
    
    .track-album {
        font-size: 10px;
    }
    
    .track-timelen {
        font-size: 10px;
    }
    
    .track-number {
        font-size: 10px;
    }
    
    .track-number.current {
        font-size: 12px;
    }
    
    .track-number-header {
        font-size: 10px;
    }
    
    .track-title-header, .track-artist-header, .track-album-header, .track-timelen-header {
        font-size: 10px;
    }
    
    .track-title-header i, .track-artist-header i, .track-album-header i, .track-timelen-header i {
        font-size: 8px;
    }
}
    
    .li {
        padding: 5px 10px;
    }
    
    .track-number {
        flex: 5;
        min-width: 20px;
        margin-right: 0;
    }
    
    .track-title-container {
        flex: 31;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    
    /* 网格视图移动端适配 */
    .li.cover-view {
        flex-direction: row;
        align-items: center;
        height: 70px;
        padding: 10px;
    }
    
    .li.cover-view .track-cover {
        width: 50px;
        height: 50px;
        margin-right: 10px;
        margin-bottom: 0;
    }
    
    .li.cover-view .track-cover img {
        width: 100%;
        height: 100%;
    }
    
    .li.cover-view .track-title-container {
        flex: 2;
        margin-bottom: 0;
    }
    
    .li.cover-view .track-artist {
        flex: 1;
        margin-bottom: 0;
    }
    
    .li.cover-view .track-album {
        flex: 1;
        margin-bottom: 0;
    }
    
    .li.cover-view .track-timelen {
        width: 80px;
        text-align: right;
    }
}

.cover-art {
    width: 100px;
    height: 100px;
    border-radius: 16px;
    margin-right: 20px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    object-fit: cover;
    transition: transform 0.3s ease;
}

.cover-art-placeholder {
    width: 100px;
    height: 100px;
    border-radius: 16px;
    margin-right: 20px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s ease;
}

.cover-art-placeholder i {
    font-size: 40px;
    color: white;
}

.cover-art:hover,
.cover-art-placeholder:hover {
    transform: scale(1.05);
}

.artist-avatar {
    border-radius: 16px;
    width: 100px;
    height: 100px;
}

.artist-header {
    height: 100px;
}

.header-album-cover {
    border-radius: 16px;
    width: 100px;
    height: 100px;
}

.playlist-cover {
    border-radius: 16px;
    width: 100px;
    height: 100px;
}

.album-header {
    height: 100px;
}

.playlist-header {
    height: 100px;
}

.playlist-description {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 12px 16px;
    margin-bottom: 15px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    line-height: 1.6;
    backdrop-filter: blur(10px);
}

.info {
    max-width: 600px;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.title {
    font-size: 16px;
    font-weight: bold;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    margin: 0;
    color: white;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.subtitle {
    font-size: 18px;
    color: rgba(255, 255, 255, 0.9);
    margin: 8px 0;
}

.meta {
    font-size: 14px;
    margin-bottom: 10px;
    color: rgba(255, 255, 255, 0.8);
}

.stats {
    display: flex;
    gap: 15px;
    color: rgba(255, 255, 255, 0.9);
    margin-top: 5px;
    flex-wrap: wrap;
    font-size: 14px;
}

.playlist-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    justify-content: flex-start;
}

.playlist-actions .batch-action-btn {
    padding: 6px 12px;
    font-size: 13px;
    border-radius: 18px;
}

.description {
    white-space: pre-wrap;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 20px;
    font-size: 16px;
    max-height: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    background: rgba(255, 255, 255, 0.1);
    padding: 12px;
    border-radius: 8px;
    backdrop-filter: blur(10px);
}

.actions {
    display: flex;
    gap: 10px;
}

.primary-btn, .follow-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 25px;
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.primary-btn:hover, .follow-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.primary-btn i, .follow-btn i {
    margin-right: 8px;
    font-size: 16px;
}

.follow-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

.fav-btn,
.more-btn {
    background-color: rgba(255, 255, 255, 0.1);
    padding: 10px;
    border-radius: 25px;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.3);
    height: 100%;
    transition: all 0.3s ease;
    color: white;
}

.fav-btn:hover,
.more-btn:hover {
    background-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
}

.fav-btn i {
    color: rgba(255, 255, 255, 0.7);
}

.fav-btn.active i {
    color: white;
}

/* 歌曲列表样式 */
.track-list-container {
    margin-top: 20px;
    background: transparent;
    border-radius: 0;
    padding: 0;
    backdrop-filter: none;
    box-shadow: none;
}

.track-list-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 20px;
    width: 100%;
}

.track-list-header-top {
    margin-bottom: 15px;
    width: 100%;
}

.track-list-header-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
}

.track-list-title {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 10px;
    color: white;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* 搜索和批量操作按钮 */
.track-list-actions-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.track-list-actions-right {
    display: flex;
    align-items: center;
}

.batch-action-container {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
}

.batch-action-btn {
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding: 8px 15px;
    border-radius: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    position: relative;
    transition: all 0.3s ease;
}

.batch-action-btn:hover {
    background-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
}

.batch-action-btn.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
}

.batch-action-btn.action-btn {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.3);
    margin-left: 10px;
}

.batch-action-btn.action-btn:hover {
    background: rgba(255, 255, 255, 0.3);
}

/* 视图模式切换按钮 */
.view-mode-btn {
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding: 8px 12px;
    border-radius: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    width: 40px;
    height: 35px;
    transition: all 0.3s ease;
}

.view-mode-btn:hover {
    background-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
}

.view-mode-btn i {
    font-size: 16px;
}

.selected-count {
    position: absolute;
    top: -8px;
    right: -8px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
}

/* 排序选择器样式 */
.sort-selector {
    display: flex;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 20px;
    overflow: hidden;
    background-color: rgba(255, 255, 255, 0.1);
}

.sort-btn {
    background-color: transparent;
    border: none;
    padding: 8px 15px;
    cursor: pointer;
    color: white;
    transition: all 0.3s ease;
    font-size: 14px;
}

.sort-btn:not(:last-child) {
    border-right: 1px solid rgba(255, 255, 255, 0.3);
}

.sort-btn:hover {
    background-color: rgba(255, 255, 255, 0.2);
}

.sort-btn.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.search-input {
    width: 250px;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 25px;
    box-sizing: border-box;
    padding-left: 15px;
    background-color: rgba(255, 255, 255, 0.1);
    color: white;
    transition: all 0.3s ease;
}

.search-input:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.5);
    background-color: rgba(255, 255, 255, 0.15);
}

.search-input::placeholder {
    color: rgba(255, 255, 255, 0.7);
}

.track-list {
    max-height: none;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
    overflow: visible;
    border-radius: 0;
    background: transparent;
    padding: 0;
}

.load-more-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 20px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
}

.load-more-indicator i {
    font-size: 18px;
}

.no-more-data {
    text-align: center;
    padding: 20px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 14px;
}

/* 搜索加载动画 */
.search-loading-overlay {
    max-height: none;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 150px;
    border-radius: 0;
    background: transparent;
}

.search-loading-spinner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
    color: white;
}

.search-loading-spinner i {
    font-size: 48px;
    color: white;
}

.search-loading-spinner span {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.8);
}


.track-list::-webkit-scrollbar {
    width: 8px !important; 
    display: block !important;
}

.track-list::-webkit-scrollbar-track {
    background: transparent;
}

.track-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 4px;
}

.track-list::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
}

.track-list:hover {
    scrollbar-color: rgba(255, 255, 255, 0.5) transparent;
}

.li {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    padding: 10px 15px;
    border-bottom: none;
    border-radius: 0;
    cursor: pointer;
    transition: all 0.3s ease;
    margin-bottom: 0;
}

.li:hover {
    background-color: rgba(255, 255, 255, 0.1);
    transform: translateX(5px);
}

.li.selected {
    background-color: rgba(102, 126, 234, 0.2);
}

/* 歌曲多选 */
.track-checkbox {
    margin-right: 10px;
    width: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.track-checkbox input[type="checkbox"] {
    accent-color: #667eea;
}

.track-number {
    font-weight: bold;
    margin-right: 0;
    flex: 5;
    min-width: 20px;
    display: flex;
    align-items: flex-end;
    justify-content: flex-start;
    height: 20px;
    color: rgba(255, 255, 255, 0.8);
}

.track-number.current {
    color: white;
}

.track-title.current {
    color: white;
    font-weight: bold;
}

/* 声波动画 */
.sound-wave {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 16px;
}

.sound-wave span {
    width: 3px;
    background-color: white;
    animation: wave 0.8s ease-in-out infinite;
}

.sound-wave span:nth-child(1) {
    height: 6px;
    animation-delay: 0s;
}

.sound-wave span:nth-child(2) {
    height: 12px;
    animation-delay: 0.2s;
}

.sound-wave span:nth-child(3) {
    height: 8px;
    animation-delay: 0.4s;
}

@keyframes wave {
    0%, 100% {
        transform: scaleY(0.5);
    }
    50% {
        transform: scaleY(1);
    }
}

.track-title-container {
    flex: 31;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    text-align: left;
}

.track-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: white;
    text-align: left;
}

.track-remark {
    color: rgba(255, 255, 255, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
}

.track-artist {
    flex: 24;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 2px;
    color: rgba(255, 255, 255, 0.8);
    text-align: left;
}

.track-album {
    flex: 24;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 2px;
    color: rgba(255, 255, 255, 0.8);
    text-align: left;
}

.track-timelen {
    flex: 6;
    text-align: right;
    color: rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
}

.track-actions {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 15;
    min-width: 60px;
    justify-content: flex-end;
}

.track-actions button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 5px;
    border-radius: 50%;
    transition: all 0.3s ease;
}

.track-actions button:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

.track-actions i {
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
}

.track-actions button:hover i {
    color: white;
}

.icon {
    margin-left: 5px;
    border: 1px solid;
    border-radius: 5px;
    font-size: 10px;
    padding-left: 6px;
    padding-right: 6px;
}

.vip-icon {
    color: #ff6d00;
}

.sq-icon {
    color: #0094ff;
}

.mv-icon {
    color: #ff1744;
}

.queue-play-btn {
    background: none;
    border: none;
    font-size: 16px;
    color: white;
    cursor: pointer;
    transition: all 0.3s ease;
}

.queue-play-btn:hover {
    transform: scale(1.1);
    color: rgba(255, 255, 255, 0.8);
}

/* 导航按钮 */
.location-arrow {
    position: fixed;
    bottom: 168px;
    right: 14px;
    z-index: 1;
    cursor: pointer;
    font-size: 24px;
    color: white;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
}

.location-arrow:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.scroll-bottom-img {
    position: fixed;
    bottom: 100px;
    right: 14px;
    z-index: 1;
    cursor: pointer;
    font-size: 24px;
    color: white;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
}

.scroll-bottom-img:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

/* 下拉菜单 */
.more-btn-container {
    position: relative;
}

.dropdown-menu {
    position: absolute;
    background-color: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    top: 60px;
    z-index: 50;
    backdrop-filter: blur(10px);
    min-width: 150px;
}

.dropdown-menu ul {
    list-style: none;
    padding: 0;
    margin: 0;
}

.dropdown-menu li {
    padding: 12px 15px;
    cursor: pointer;
    color: #333;
    transition: all 0.3s ease;
}

.dropdown-menu li:hover {
    background-color: rgba(102, 126, 234, 0.1);
}

.dropdown-menu li i {
    margin-right: 10px;
    width: 16px;
    text-align: center;
}

/* 音符动画 */
.note-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    overflow: hidden;
}

.flying-note {
    position: absolute;
    font-size: 36px;
    color: white;
    pointer-events: none;
    transform-origin: center;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.fly-note-enter-active {
    animation: fly-note 2s ease-out forwards;
}

.fly-note-leave-active {
    animation: fly-note 2s ease-out forwards;
}

@keyframes fly-note {
    0% {
        transform: translate(var(--start-x), calc(var(--start-y) - 50px)) rotate(0deg) scale(1.2);
        opacity: 0.9;
    }
    20% {
        transform: translate(calc(var(--start-x) + 20px), calc(var(--start-y) - 70px)) rotate(45deg) scale(1.3);
        opacity: 0.85;
    }
    100% {
        transform: translate(80vw, 100vh) rotate(360deg) scale(0.6);
        opacity: 0;
    }
}

/* 表头样式 */
.track-list-header-row {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    padding: 12px 15px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    background-color: rgba(255, 255, 255, 0.1);
    border-radius: 10px 10px 0 0;
    margin-bottom: 10px;
}

.track-checkbox-header {
    margin-right: 10px;
    width: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.track-checkbox-header input[type="checkbox"] {
    accent-color: #667eea;
}

.track-number-header {
    font-weight: bold;
    margin-right: 0;
    flex: 5;
    min-width: 20px;
    color: white;
    display: flex;
    align-items: center;
    justify-content: flex-start;
}

.track-title-header, .track-artist-header, .track-album-header, .track-timelen-header, .track-actions-header {
    cursor: pointer;
    display: flex;
    align-items: center;
    color: white;
    transition: all 0.3s ease;
    font-weight: bold;
    padding: 0;
}

.track-title-header:hover, .track-artist-header:hover, .track-album-header:hover, .track-timelen-header:hover {
    color: rgba(255, 255, 255, 0.8);
    transform: translateY(-2px);
}

.track-title-header {
    flex: 31;
    justify-content: flex-start;
    text-align: left;
}

.track-artist-header, .track-album-header {
    flex: 24;
    padding: 0 2px;
    justify-content: flex-start;
    text-align: left;
}

.track-timelen-header {
    flex: 6;
    justify-content: flex-end;
    padding: 0;
}

.track-actions-header {
    flex: 10;
    min-width: 60px;
    justify-content: flex-end;
    padding: 0;
}

.track-title-header i, .track-artist-header i, .track-album-header i, .track-timelen-header i {
    margin-left: 8px;
    transition: all 0.3s ease;
}

.track-list-header-row:hover {
    background-color: rgba(255, 255, 255, 0.15);
}

/* 网格视图样式 */
.li.cover-view {
    height: 70px;
    padding: 10px 15px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    transition: all 0.3s ease;
    margin-bottom: 5px;
}

.li.cover-view:hover {
    background-color: rgba(255, 255, 255, 0.1);
    transform: translateX(5px);
}

.track-cover {
    position: relative;
    width: 50px;
    height: 50px;
    margin-right: 15px;
    overflow: hidden;
    border-radius: 8px;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.track-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
}

.li.cover-view:hover .track-cover img {
    transform: scale(1.1);
}

.track-cover-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(102, 126, 234, 0.7);
    opacity: 0;
    transition: opacity 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 20px;
    border-radius: 8px;
}

.li.cover-view:hover .track-cover-overlay {
    opacity: 1;
}

/* 调整封面视图下的其他元素样式 */
.li.cover-view .track-title-container {
    flex: 3;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.li.cover-view .track-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: white;
    font-size: 14px;
}

.li.cover-view .track-remark {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
}

.li.cover-view .track-artist {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 10px;
    color: rgba(255, 255, 255, 0.8);
}

.li.cover-view .track-album {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 10px;
    color: rgba(255, 255, 255, 0.8);
}

.li.cover-view .track-timelen {
    width: 95px;
    text-align: right;
    color: rgba(255, 255, 255, 0.8);
}

.li.cover-view .track-checkbox,
.li.cover-view .track-number {
    margin-right: 10px;
    width: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.li.cover-view .track-number {
    color: rgba(255, 255, 255, 0.8);
}
</style>