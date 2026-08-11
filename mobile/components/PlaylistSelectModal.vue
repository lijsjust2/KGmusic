<template>
    <transition name="fade">
        <div v-if="isOpen" class="modal">
            <div class="modal-content">
                <h3>{{ t('shou-cang-dao') }}</h3>
                <ul class="playlist-select-list" v-if="playlists.length > 0">
                    <li v-for="playlist in playlists" 
                        :key="playlist.list_id" 
                        @click="addToPlaylist(playlist.listid, savedSong); isOpen = false">
                        {{ playlist.name }} ({{ playlist.count }})
                    </li>
                </ul>
                <div v-else>{{ t('mei-you-ge-dan') }}</div>
                <button class="close-btn-modal" @click="isOpen = false">{{ t('guan-bi-an-niu') }}</button>
            </div>
        </div>
    </transition>
</template>

<script setup>
import { ref } from 'vue';
import { get } from '../utils/request';
import { useI18n } from 'vue-i18n';
import { MoeAuthStore } from '../stores/store';
import message from '../utils/message';

const MoeAuth = MoeAuthStore();
const { t } = useI18n();

const props = defineProps({
    currentSong: {
        type: Object,
        required: true
    }
});
const playlists = ref([]);
const isOpen = ref(false);
const savedSong = ref(null);

const validateUserAndSong = () => {
    if (!MoeAuth.isAuthenticated) {
        window.$modal.alert(t('qing-xian-deng-lu'));
        return false;
    }
    if (!savedSong.value) {
        window.$modal.alert('没有选择歌曲');
        return false;
    }
    if (Array.isArray(savedSong.value)) {
        if(!savedSong.value[0] || !savedSong.value[0].hash){
            window.$modal.alert('没有选择正确的歌曲');
            return false;
        }
    }else if (!savedSong.value.hash) {
        window.$modal.alert(t('mei-you-zheng-zai-bo-fang-de-ge-qu'));
        return false;
    }
    if (savedSong.value.isCloud) {
        window.$modal.alert('云盘音乐不支持添加到歌单');
        return false;
    }
    if(savedSong.value.isLocal){
        window.$modal.alert('本地音乐不支持添加到歌单');
        return false;
    }
    return true;
};

const fetchPlaylists = async () => {
    savedSong.value = props.currentSong;
    try {
        const playlistResponse = await get('/user/playlist', {
            pagesize: 100
        });
        if (playlistResponse.status !== 1) {
            message.error(t('huo-qu-ge-dan-shi-bai'));
            return;
        }
        playlists.value = playlistResponse.data.info.filter(
            playlist => playlist.list_create_userid === MoeAuth.UserInfo.userid
        );
        isOpen.value = true;
    } catch (error) {
        message.error(t('huo-qu-ge-dan-shi-bai'));
        isOpen.value = false;
    }
};

const addToPlaylist = async (listid, song) => {
    if (!validateUserAndSong()) return;
    
    if(Array.isArray(savedSong.value)){
        const songs = savedSong.value.map(s => `${encodeURIComponent(s.name.replace(',', ''))}|${s.hash}`);
        
        const batchSize = 50;
        const batches = [];
        for (let i = 0; i < songs.length; i += batchSize) {
            batches.push(songs.slice(i, i + batchSize));
        }
        
        let successCount = 0;
        try {
            for (const batch of batches) {
                try {
                    const song_data = batch.join(',');
                    await get(`/playlist/tracks/add?listid=${listid}&data=${song_data}`);
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error('Batch add failed:', error);
                }
            }
            if (successCount === batches.length) {
                message.success(t('cheng-gong-tian-jia-dao-ge-dan'));
            } else if (successCount > 0) {
                message.success(`部分添加成功 (${successCount}/${batches.length})`);
            } else {
                message.error(t('tian-jia-dao-ge-dan-shi-bai'));
            }
        } catch (error) {
            message.error(t('tian-jia-dao-ge-dan-shi-bai'));
        }
    }else{
        const song_data = `${encodeURIComponent(savedSong.value.name.replace(',', ''))}|${savedSong.value.hash}`;
        try {
            await get(`/playlist/tracks/add?listid=${listid}&data=${song_data}`);
            message.success(t('cheng-gong-tian-jia-dao-ge-dan'));
        } catch (error) {
            message.error(t('tian-jia-dao-ge-dan-shi-bai'));
        }
    }
    isOpen.value = false;
};

const toLike = () => {
    const like_id = localStorage.getItem('like');
    if(!like_id) {window.$modal.alert('先去看看你的收藏夹吧');return;}
    savedSong.value = props.currentSong;
    addToPlaylist(like_id, props.currentSong);
};

defineExpose({
    toLike,
    fetchPlaylists,
    validateUserAndSong,
    addToPlaylist
});
</script>

<style scoped>
.modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.modal-content {
    background-color: white;
    padding: 20px;
    border-radius: 12px;
    min-width: 300px;
    max-width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.playlist-select-list {
    list-style: none;
    padding: 0;
    margin: 15px 0;
    max-height: 300px;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
}

.playlist-select-list::-webkit-scrollbar {
    display: none;
}

.playlist-select-list li {
    padding: 16px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 12px;
    background: #f7fafc;
    color: #2d3748;
    font-size: 15px;
    font-weight: 500;
    margin-bottom: 8px;
    border: 1px solid #e2e8f0;
}

.playlist-select-list li:hover {
    background: #667eea;
    color: white;
    transform: translateX(4px) scale(1.02);
    border-color: #667eea;
}

.modal .close-btn-modal {
    width: 100%;
    padding: 12px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    margin-top: 15px;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.3s;
}

.modal .close-btn-modal:hover {
    opacity: 0.9;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}
</style>