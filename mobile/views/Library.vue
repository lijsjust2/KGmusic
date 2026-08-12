<template>
    <div class="library-page">
        <div class="profile-section">
            <div class="profile-header">
                <img class="profile-pic" :src="user.pic" :alt="$t('yong-hu-tou-xiang')" />
                <div class="profile-info">
                    <h1 class="user-name">{{ user.nickname }}</h1>
                    <div class="user-stats">
                        <span>ID: {{ user.userid }}</span>
                        <span>Lv.{{ userDetail.p_grade || 0 }}</span>
                    </div>
                </div>
            </div>
        </div>
        <h2 class="section-title" @click="addAllSongsToQueue">{{ $t('wo-xi-huan-ting') }}</h2>
        <div class="favorite-section">
            <div class="song-list">
                <div v-if="isLoading" class="skeleton-loader">
                    <div v-for="n in 16" :key="n" class="skeleton-item">
                        <div class="skeleton-cover"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-line"></div>
                            <div class="skeleton-line short"></div>
                        </div>
                    </div>
                </div>
                <ul v-if="listenHistory.length > 0">
                    <li v-for="(song, index) in listenHistory" :key="index" class="song-item"
                        @click="playSong($getQuality(null, song), song.name.split(' - ')[1] || song.name, $getCover(song.image, 480), song.singername)">
                        <img :src="$getCover(song.image, 120)" class="album-cover" />
                        <div class="song-info">
                            <p class="album-name">{{ song.name.split(' - ')[1] || song.name }}</p>
                            <p class="singer-name">{{ song.singername }}</p>
                        </div>
                    </li>
                </ul>
                <div v-else class="empty-container">
                    <div class="empty-icon">
                        <i class="fas fa-music"></i>
                    </div>
                    <div class="empty-description">{{ t('zhe-li-shi-mo-du-mei-you') }}</div>
                </div>
            </div>
        </div>

        <!-- 分类导航 -->
        <div class="category-tabs">
            <button v-for="(tab, index) in categories" :key="index" :class="{ 'active': selectedCategory === index }"
                @click="selectCategory(index)">
                {{ tab }}
            </button>
        </div>

        <!-- 音乐卡片网格（显示歌单或关注的歌手） -->
        <div class="music-grid">
            <template v-if="selectedCategory === 0 || selectedCategory === 1 || selectedCategory === 2">
                <div class="music-card" 
                    v-for="(item, index) in (selectedCategory === 0 ? userPlaylists : selectedCategory === 1 ? collectedPlaylists : collectedAlbums)"
                    :key="index">
                    <router-link :to="{
                        path: '/PlaylistDetail',
                        query: { global_collection_id: item.list_create_gid || item.global_collection_id, listid: item.listid}
                    }">
                        <img v-if="item.pic" :src="$getCover(item.pic, 480)" class="album-image" />
                        <div v-else class="album-icon live-icon">
                            <i class="fas fa-compact-disc"></i>
                        </div>
                        <div class="album-info">
                            <h3>{{ item.name }}</h3>
                            <p>{{ item.count }} <span>{{ $t('shou-ge') }}</span></p>
                        </div>
                    </router-link>
                </div>
                <div v-if="selectedCategory === 0 && !isLoading" class="music-card create-playlist-button">
                    <i class="fas fa-plus"></i>
                    <div class="album-icon create-playlist-icon" @click="createPlaylist">
                        <i class="fas fa-plus-circle"></i>
                    </div>
                    <div class="album-info" @click="createPlaylist">
                        <h3>{{ $t('chuang-jian-ge-dan') }}</h3>
                        <p>(≧∀≦)♪</p>
                    </div>
                </div>
            </template>
            <div v-if="selectedCategory === 3 || selectedCategory === 4" class="music-card"
                v-for="(artist, index) in (selectedCategory === 3 ? followedArtists : selectedCategory === 4 ? collectedFriends  : [])" :key="index"
                @click="goToArtistDetail(artist)">
                <img :src="artist.pic" class="album-image" />
                <div class="album-info">
                    <h3>{{ artist.nickname }}</h3>
                </div>
            </div>
        </div>
        <div v-if="
        (selectedCategory == 0 && userPlaylists.length === 0) || 
        (selectedCategory == 1 && collectedPlaylists.length === 0) || 
        (selectedCategory == 2 && collectedAlbums.length === 0) || 
        (selectedCategory == 3 && followedArtists.length === 0) || 
        (selectedCategory == 4 && collectedFriends.length === 0)"
            class="empty-container">
            <div class="empty-icon">
                <i class="fas fa-music"></i>
            </div>
            <div class="empty-description">{{ t('zhe-li-shi-mo-du-mei-you') }}</div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { get } from '../utils/request';
import { MoeAuthStore } from '../stores/store';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import BirthdayEasterEgg from '../components/BirthdayEasterEgg.vue';
const { t } = useI18n();
const router = useRouter();
const MoeAuth = MoeAuthStore();
const user = ref({});
const userPlaylists = ref([]); // 创建的歌单
const collectedPlaylists = ref([]); // 收藏的歌单
const collectedAlbums = ref([]); // 收藏的专辑
const collectedFriends = ref([]); // 好友
const followedArtists = ref([]); // 关注的歌手
const listenHistory = ref([]); // 听歌历史
const userVip = ref({});
const userDetail = ref({}); // 新增：用户详细信息
const categories = ref([t('wo-chuang-jian-de-ge-dan'), t('wo-shou-cang-de-ge-dan'), t('wo-shou-cang-de-zhuan-ji'), t('wo-guan-zhu-de-ge-shou'), t('wo-guan-zhu-de-hao-you')]);
const selectedCategory = ref(0);
const isLoading = ref(true); 

const selectCategory = (index) => {
    selectedCategory.value = index;
    router.replace({ path: '/library', query: { category: index } });
};

// 退出登录
const handleLogout = () => {
    MoeAuth.clearUserData();
    router.push('/login');
};

// 格式化听歌时长（分钟转为小时和分钟）
const formatDuration = (minutes) => {
    if (!minutes) return '0';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
        return `${hours}${t('xiao-shi')} ${mins}${t('fen-zhong')}`;
    }
    return `${mins}${t('fen-zhong')}`;
};

// 格式化注册时间
const formatRegTime = (timestamp) => {
    if (!timestamp) return '';
    const registerDate = new Date(timestamp * 1000);
    const now = new Date();
    const years = now.getFullYear() - registerDate.getFullYear();
    return `${t('le-ling')} ${years} ${t('nian')}`;
};

const playSong = (hash, name, img, author) => {
    props.playerControl.addSongToQueue(hash, name, img, author);
};

const props = defineProps({
    playerControl: Object
});

onMounted(() => {
    if (MoeAuth.isAuthenticated) {
        user.value = MoeAuth.UserInfo;
        getVipInfo();
    }
});
const getUserDetails = () => {
    // 获取用户详细信息
    getUserDetail();
    // 获取用户听歌历史
    getlisten().finally(() => {
        isLoading.value = false; 
    })
    // 获取用户创建和收藏的歌单
    getplaylist()
    // 获取用户关注的歌手
    getfollow()
    selectedCategory.value = parseInt(router.currentRoute.value.query.category || 0);
}

// 获取用户详细信息
const getUserDetail = async () => {
    try {
        const detailResponse = await get('/user/detail');
        if (detailResponse.status === 1) {
            userDetail.value = detailResponse.data;
        }
    } catch (error) {
        console.error('Failed to get user details:', error);
    }
}

const getVipInfo = async () => {
    try {
        const data = await MoeAuth.fetchVipInfo();
        if (data) {
            userVip.value = data.busi_vip
            getUserDetails();
        }
    } catch (error) {
        // 只有明确的登录失效（status===2）才跳转登录，网络错误/502 等不退出
        if (error?.code === 'LOGIN_EXPIRED') {
            window.$modal.alert(t('deng-lu-shi-xiao-qing-zhong-xin-deng-lu'));
            router.push('/login');
        } else {
            console.warn('获取VIP信息失败:', error?.message);
        }
    }
}

const getlisten = async () => {
    const historyResponse = await get('/user/listen', { type: 1 });
    if (historyResponse.status === 1) {
        const allLists = historyResponse.data.lists;
        const shuffled = allLists.sort(() => 0.5 - Math.random());
        listenHistory.value = shuffled.slice(0, 16);
    }
}
const getfollow = async () => {
    const followResponse = await get('/user/follow');
    if (followResponse.status === 1) {
        if (followResponse.data.total == 0) return;
        const artists = followResponse.data.lists.map(artist => ({
            ...artist,
            pic: artist.pic.replace('/100/', '/480/')
        }));
        collectedFriends.value = artists.filter(artist => !artist.singerid);
        followedArtists.value = artists.filter(artist => artist.source == 7);
    }
}
const getplaylist = async () => {
    try {
        const playlistResponse = await get('/user/playlist',{
            pagesize:500,
            t: localStorage.getItem('t')
        });
        if (playlistResponse.status === 1) {
            const sortedInfo = playlistResponse.data.info.sort((a, b) => {
                if (a.sort !== b.sort) {
                    return a.sort - b.sort;
                }
                return 0;
            });

            userPlaylists.value = sortedInfo.filter(playlist => {
                if (playlist.name == '我喜欢') {
                    localStorage.setItem('like', playlist.listid);
                }
                return playlist.list_create_userid === user.value.userid || playlist.name === '我喜欢';
            }).sort((a, b) => {
                // 我喜欢 (is_def: 2) 排在最前面
                if (a.is_def === 2) return -1;
                if (b.is_def === 2) return 1;
                // 默认收藏 (is_def: 1) 排在第二位
                if (a.is_def === 1) return -1;
                if (b.is_def === 1) return 1;
                // 其他歌单按照创建时间新到旧排序
                if (a.create_time && b.create_time) {
                    return new Date(b.create_time) - new Date(a.create_time);
                }
                return 0;
            });

            collectedPlaylists.value = sortedInfo.filter(playlist => 
                playlist.list_create_userid !== user.value.userid && !playlist.authors
            );

            collectedAlbums.value = sortedInfo.filter(playlist => 
                playlist.list_create_userid !== user.value.userid && playlist.authors
            );
            
            const collectedIds = [];
            sortedInfo.forEach(playlist => {
                if (playlist.list_create_userid !== user.value.userid) {
                    collectedIds.push({
                        list_create_listid: playlist.list_create_listid, 
                        listid: playlist.listid
                    });
                }
            });
            localStorage.setItem('collectedPlaylists', JSON.stringify(collectedIds));
        }
    } catch (error) {
        window.$modal.alert(t('xin-zeng-zhang-hao-qing-xian-zai-guan-fang-ke-hu-duan-zhong-deng-lu-yi-ci'));
    }
}
const createPlaylist = async () => {
    const result = await window.$modal.prompt(t('qing-shu-ru-xin-de-ge-dan-ming-cheng'), '');
    if (result) {
        try {
            const playlistResponse = await get('/playlist/add', { name: result, list_create_userid: user.value.userid });
            if (playlistResponse.status === 1) {
                localStorage.setItem('t', Date.now());
                getplaylist()
            }
        } catch (error) {
            window.$modal.alert(t('chuang-jian-shi-bai'));
        }
    }
}

const goToArtistDetail = (artist) => {
    if (!artist.singerid) return;
    router.push({
        path: '/PlaylistDetail',
        query: { 
            singerid: artist.singerid,
            unfollow: true
        }
    });
};
const signIn = async () => {
    try {
        const res = await MoeAuth.claimHourVip();
        if (res.status === 1) {
            window.$modal.alert(`签到成功，获得${res.data.award_vip_hour}小时VIP时长`);
        }
    } catch (error) {
        const data = error.response?.data;
        const errCode = data?.error_code || data?.errcode;
        if (errCode === 131001 || errCode === 297002) {
            window.$modal.alert(data?.error_msg || '今天已经签到过了');
        } else {
            window.$modal.alert('签到失败![该接口将在未来被移除]');
        }
    }
}
const getVip = async () => {
    try {
        const todayKey = new Date().toISOString().split('T')[0];
        const vipResponse = await MoeAuth.claimDayVip(todayKey);
        const result = await window.$modal.confirm('是否继续升级至概念版VIP,享受更高音质?');
        if (result) {
            try {
                const upgradeRes = await MoeAuth.upgradeDayVip();
                if (upgradeRes.status === 1) {
                    window.$modal.alert('升级成功，获得1天概念版VIP');
                }
            } catch (error) {
                const data = error.response?.data || error.response;
                const errCode = data?.error_code;
                if (errCode === 131001 || errCode === 297002) {
                    window.$modal.alert(data?.error_msg || (errCode === 297002 ? '已经领取过升级vip奖励' : '今天已经签到过了'));
                } else {
                    window.$modal.alert(data?.error_msg || '升级VIP失败, 一天仅限一次');
                }
            }
        } else if (vipResponse.status === 1) {
            window.$modal.alert(`签到成功，获得1天畅听VIP`);
        }
    } catch (error) {
        const data = error.response?.data || error.response;
        const errCode = data?.error_code || data?.errcode;
        if (errCode === 131001 || errCode === 297002) {
            window.$modal.alert(data?.error_msg || (errCode === 297002 ? '已经领取过升级vip奖励' : '今天已经签到过了'));
        } else {
            window.$modal.alert(data?.error_msg || '获取VIP失败, 一天仅限一次');
        }
    }
}
const addAllSongsToQueue = () => {
    props.playerControl.addPlaylistToQueue(listenHistory.value.map(song => ({
        hash: song.hash,
        name: song.name,
        cover: song.image?.replace("{size}", 480),
        author: song.author_name,
        timelen: song.duration
    })));
};
</script>

<style scoped>
.sign-in {
    cursor: pointer;
    color: white;
    margin-left: 10px;
    border-radius: 20px;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    font-size: 14px;
    background: rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
}

.sign-in:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
}

.library-page {
    padding: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
    min-height: calc(100vh - 140px);
}

.user-level {
    width: 50px;
    margin-left: 10px;
    cursor: pointer;
}


.section-title {
    font-size: 26px;
    font-weight: 700;
    margin-bottom: 20px;
    color: white;
    cursor: pointer;
    display: inline-block;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.3s ease;
    letter-spacing: 0.5px;
}

.section-title:hover {
    transform: translateY(-2px);
    text-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.profile-section {
    display: flex;
    align-items: center;
    margin-bottom: 20px;
}

.profile-header {
    display: flex;
    align-items: center;
    gap: 15px;
    width: 100%;
    height: 80px;
}

.profile-pic {
    border-radius: 16px;
    width: 80px;
    height: 80px;
    object-fit: cover;
}

.profile-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.user-name {
    font-size: 18px;
    font-weight: bold;
    margin: 0;
    color: white;
}

.user-stats {
    display: flex;
    gap: 15px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.85);
}

.user-vip-icon {
    height: 24px;
    margin-left: 12px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.user-signature {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.95);
    margin-bottom: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    font-weight: 400;
}

.user-stats {
    display: flex;
    justify-content: flex-start;
    gap: 28px;
    margin-bottom: 10px;
    font-size: 14px;
    color: #fff;
}

.stat-item {
    text-align: center;
    transition: transform 0.3s ease;
}

.stat-item:hover {
    transform: translateY(-2px);
}

.stat-value {
    font-size: 22px;
    font-weight: 700;
    display: inline-block;
    margin-right: 4px;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.stat-label {
    display: inline-block;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.75);
}

.user-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    color: #fff;
    margin-bottom: 14px;
    flex-wrap: wrap;
}

.user-gender i {
    font-size: 16px;
    color: #fff;
}

.user-duration,
.user-age {
    background-color: rgba(255, 255, 255, 0.18);
    padding: 5px 12px;
    border-radius: 18px;
    color: white;
    font-weight: 500;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.user-actions {
    display: flex;
    gap: 10px;
    margin-top: 12px;
    flex-wrap: wrap;
}

.action-button {
    background: rgba(255, 255, 255, 0.15);
    padding: 10px 20px;
    border-radius: 20px;
    color: white;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    border: 1px solid rgba(255, 255, 255, 0.25);
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(10px);
}

.action-button:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    border-color: rgba(255, 255, 255, 0.4);
}

.action-button:active {
    transform: translateY(0);
}

.logout-button {
    background: rgba(255, 71, 87, 0.85);
    border-color: rgba(255, 71, 87, 0.9);
}

.logout-button:hover {
    background: rgba(255, 71, 87, 1);
    border-color: rgba(255, 71, 87, 1);
}

.favorite-section {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 20px;
    margin-bottom: 30px;
    backdrop-filter: blur(20px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.song-list {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    margin-top: 10px;
}

.category-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 25px;
    flex-wrap: wrap;
    padding: 5px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 25px;
    backdrop-filter: blur(10px);
}

.category-tabs button {
    background: transparent;
    border: none;
    padding: 12px 20px;
    border-radius: 20px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-weight: 500;
    position: relative;
}

.category-tabs button:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
}

.category-tabs button.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-weight: 600;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.music-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 16px;
    margin-bottom: 30px;
}

.music-card {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.music-card:hover {
    transform: translateY(-8px) scale(1.02);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.2);
}

.music-card a {
    text-decoration: none;
    color: inherit;
    display: block;
    height: 100%;
}

.album-image {
    width: 100%;
    height: 160px;
    object-fit: cover;
    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.album-icon {
    width: 100%;
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.cloud-disk-icon {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.cloud-disk-icon i {
    font-size: 60px;
    color: white;
}

.live-icon {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.live-icon i {
    font-size: 60px;
    color: white;
}

.create-playlist-icon {
    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.create-playlist-icon i {
    font-size: 60px;
    color: white;
}

.music-card:hover .album-image,
.music-card:hover .album-icon {
    transform: scale(1.08);
}

.album-info {
    padding: 14px;
}

.album-info h3 {
    margin: 0 0 6px 0;
    font-size: 15px;
    color: white;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
    line-height: 1.4;
}

.album-info p {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.65);
}

.song-item {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
    width: calc(50% - 6px);
    background: rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid rgba(255, 255, 255, 0.08);
}

.song-item:hover {
    background: rgba(255, 255, 255, 0.12);
    transform: translateY(-4px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
    border-color: rgba(255, 255, 255, 0.15);
}

.album-cover {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    margin-right: 12px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
    transition: transform 0.3s ease;
}

.song-item:hover .album-cover {
    transform: scale(1.05);
}

.song-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    max-width: calc(100% - 72px);
}

.album-name {
    font-weight: 600;
    margin-bottom: 4px;
    font-size: 14px;
    color: white;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.singer-name {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
}

.skeleton-loader {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    margin-top: 10px;
}

.skeleton-item {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
    width: calc(50% - 10px);
    border-radius: 12px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    height: 80px;
}

.skeleton-cover {
    width: 60px;
    height: 60px;
    margin-right: 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
}

.skeleton-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    max-width: calc(100% - 75px);
}

.skeleton-line {
    height: 12px;
    background: rgba(255, 255, 255, 0.1);
    margin-bottom: 8px;
    border-radius: 6px;
    width: 150px;
}

.create-playlist-button {
    color: white;
    border-radius: 16px;
    cursor: pointer;
    position: relative;
    background: rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
}

.create-playlist-button:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-5px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.create-playlist-button i {
    font-size: 40px;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    z-index: 2;
}

/* 空状态容器样式 */
.empty-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 20px;
    backdrop-filter: blur(10px);
}

.empty-icon {
    margin-bottom: 20px;
    display: flex;
    justify-content: center;
}

.empty-icon i {
    font-size: 80px;
    color: rgba(255, 255, 255, 0.6);
}

.empty-description {
    color: rgba(255, 255, 255, 0.8);
    font-size: 16px;
    text-align: center;
    margin-left: 0;
    font-weight: 500;
}
</style>
