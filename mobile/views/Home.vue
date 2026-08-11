<template>
  <div class="home-container">
    <div v-if="loading" class="loading">
      <i class="fas fa-spinner fa-spin"></i>
      <p>加载中...</p>
    </div>

    <div v-else-if="error" class="error">
      <i class="fas fa-exclamation-circle"></i>
      <p>{{ error }}</p>
      <button @click="refreshRecommend">重新加载</button>
    </div>

    <div v-else>
      <div class="tabs">
        <button 
          class="tab-btn" 
          :class="{ active: currentTab === 'songs' }"
          @click="currentTab = 'songs'"
        >
          <i class="fas fa-music"></i>
          <span>推荐单曲</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: currentTab === 'playlists' }"
          @click="currentTab = 'playlists'"
        >
          <i class="fas fa-list"></i>
          <span>推荐歌单</span>
        </button>
      </div>

      <div v-if="currentTab === 'songs'">
        <div v-if="songs.length === 0" class="empty">
          <i class="fas fa-music"></i>
          <p>暂无推荐歌曲</p>
        </div>
        <div v-else class="songs-list">
          <div 
            v-for="(song, index) in songs" 
            :key="index" 
            class="song-card"
            @click="playSong(song)"
          >
            <div class="song-cover">
              <img 
                  v-if="getSongCover(song)" 
                  :src="getSongCover(song)" 
                  alt="封面"
                />
                <div v-else class="cover-placeholder">
                  <i class="fas fa-music"></i>
                </div>
            </div>

            <div class="song-info">
              <div class="song-title">{{ song.ori_audio_name || song.name || '未知歌曲' }}</div>
              <div class="song-artist">{{ song.author_name || song.author || '未知歌手' }}</div>
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
        </div>
      </div>

      <div v-if="currentTab === 'playlists'">
        <div v-if="special_list.length === 0" class="empty-playlist">
          <i class="fas fa-list"></i>
          <p>暂无推荐歌单</p>
        </div>
        <div v-else class="playlist-grid">
          <div 
            class="playlist-item" 
            v-for="(playlist, index) in special_list" 
            :key="index"
          >
            <router-link :to="{
              path: '/playlistDetail',
              query: { global_collection_id: playlist.global_collection_id }
            }">
              <img 
                :src="getPlaylistCover(playlist.flexible_cover)" 
                class="playlist-cover"
                alt="歌单封面"
              />
              <div class="playlist-info">
                <div class="playlist-title">{{ playlist.specialname }}</div>
                <div class="playlist-description">{{ playlist.intro }}</div>
              </div>
            </router-link>
          </div>
        </div>
      </div>
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
</template>

<script setup>
import { ref, onMounted, computed, getCurrentInstance } from 'vue'
import { get } from '../utils/request'
import { MoeAuthStore } from '../stores/store'
import SongActionMenu from '../components/SongActionMenu.vue'

const { proxy } = getCurrentInstance()
const MoeAuth = MoeAuthStore()
const loading = ref(true)
const error = ref('')
const songs = ref([])
const special_list = ref([])
const currentTab = ref('songs')

const showMoreMenu = ref(false)
const selectedSong = ref(null)

const currentMode = ref('1')
const modes = ['1', '2', '3']

const modeIcon = computed(() => {
  switch (currentMode.value) {
    case '1': return '💖'
    case '2': return '🎶'
    case '3': return '🔥'
    default: return '💖'
  }
})

const radioSubtitle = computed(() => {
  switch (currentMode.value) {
    case '1': return '私人专属好歌推荐'
    case '2': return '经典怀旧金曲精选'
    case '3': return '热门好歌随心听'
    default: return '根据你的听歌喜好推荐'
  }
})

const getSongCover = (song) => {
  if (!song) return null
  return proxy.$getCover(song.sizable_cover, 480)
}

const getPlaylistCover = (cover) => {
  if (!cover) return null
  return proxy.$getCover(cover, 240)
}

const fetchRecommend = async () => {
  try {
    loading.value = true
    error.value = ''
    const response = await get('/everyday/recommend')
    if (response.status === 1 && response.data?.song_list) {
      songs.value = response.data.song_list.sort(() => Math.random() - 0.5)
    } else {
      error.value = '获取推荐歌曲失败'
    }
  } catch (err) {
    console.error('获取推荐歌曲失败:', err)
    error.value = '网络错误，请稍后重试'
  } finally {
    loading.value = false
  }
}

const fetchPlaylists = async () => {
  try {
    const response = await get('/top/playlist?category_id=0')
    if (response.status === 1 && response.data?.special_list) {
      special_list.value = response.data.special_list
    }
  } catch (err) {
    console.error('获取推荐歌单失败:', err)
  }
}

const refreshRecommend = async () => {
  await fetchRecommend()
  await fetchPlaylists()
}

const playSong = (song) => {
  console.log('播放歌曲:', song.ori_audio_name || song.name)
  const songCopy = { ...song }
  if (typeof window !== 'undefined' && window.playerControl) {
    window.playerControl.addSongToQueue(
      song.hash,
      song.ori_audio_name || song.name,
      getSongCover(song),
      song.author_name || song.author,
      song.time_length || song.timelen || 0,
      { album_name: song.album_name, album_id: song.album_id, publish_date: song.publish_date }
    )
  }
}

const toggleMoreMenu = (song, event) => {
  event.stopPropagation()
  selectedSong.value = {
    ...song,
    hash: song.hash,
    name: song.ori_audio_name || song.name,
    img: getSongCover(song),
    author: song.author_name || song.author
  }
  showMoreMenu.value = true
}

const closeMoreMenu = () => {
  showMoreMenu.value = false
  selectedSong.value = null
}

const addToPlaylist = () => {
  if (selectedSong.value && typeof window !== 'undefined' && window.playerControl) {
    window.playerControl.addToPlaylist(
      selectedSong.value.hash,
      selectedSong.value.ori_audio_name || selectedSong.value.name,
      getSongCover(selectedSong.value),
      selectedSong.value.author_name || selectedSong.value.author,
      selectedSong.value.time_length || selectedSong.value.timelen || 0,
      { album_name: selectedSong.value.album_name, album_id: selectedSong.value.album_id, publish_date: selectedSong.value.publish_date }
    )
  }
  closeMoreMenu()
}

const handleAddToPlaylist = (song) => {
  if (song && typeof window !== 'undefined' && window.playerControl) {
    window.playerControl.addToPlaylist(
      song.hash,
      song.ori_audio_name || song.name,
      getSongCover(song),
      song.author_name || song.author,
      song.time_length || song.timelen || 0,
      { album_name: song.album_name, album_id: song.album_id, publish_date: song.publish_date }
    )
  }
}

const playNow = () => {
  if (selectedSong.value) {
    playSong(selectedSong.value)
  }
  closeMoreMenu()
}

const handlePlayNow = (song) => {
  if (song) {
    playSong(song)
  }
}

const handleDownloadStart = (song, quality) => {
  console.log('下载开始:', song.ori_audio_name || song.name, '音质:', quality.name)
}

const handleDownloadComplete = (song, url, quality) => {
  console.log('下载完成:', song.ori_audio_name || song.name)
}

const handleDownloadFail = (song, error) => {
  console.error('下载失败:', error.message)
}

const handleQualitySelect = (quality) => {
  console.log('选择音质:', quality.name)
}

const toggleMode = () => {
  const currentIndex = modes.indexOf(currentMode.value)
  const nextIndex = (currentIndex + 1) % modes.length
  currentMode.value = modes[nextIndex]
}

const playFM = async () => {
  try {
    const response = await get('/top/card', {
      params: {
        card_id: currentMode.value
      }
    })

    if (response.status === 1 && response.data?.song_list?.length > 0) {
      const newSongs = response.data.song_list.map(song => {
        return {
          hash: song.hash,
          name: song.songname,
          cover: proxy.$getCover(song.sizable_cover, 480),
          author: song.author_name,
          timelen: song.time_length
        }
      })
      
      if (typeof window !== 'undefined' && window.playerControl) {
        newSongs.forEach((song, index) => {
          setTimeout(() => {
            window.playerControl.addSongToQueue(
              song.hash,
              song.name,
              song.cover,
              song.author
            )
          }, index * 100)
        })
      }
    }
  } catch (error) {
    console.error('FM播放出错:', error)
  }
}

onMounted(() => {
  fetchRecommend()
  fetchPlaylists()
})
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  padding: 15px;
  padding-bottom: 120px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.loading,
.error,
.empty,
.empty-playlist {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: white;
}

.loading i,
.error i,
.empty i,
.empty-playlist i {
  font-size: 64px;
  margin-bottom: 20px;
}

.loading i {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.loading p,
.error p,
.empty p,
.empty-playlist p {
  font-size: 18px;
}

.error button {
  margin-top: 20px;
  padding: 12px 30px;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid white;
  color: white;
  border-radius: 25px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.error button:hover {
  background: white;
  color: #667eea;
}

.recommendations {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 30px;
}

.recommend-card {
  width: 100%;
  border-radius: 15px;
  overflow: hidden;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.recommend-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
}

.radio-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 15px;
  overflow: hidden;
}

.radio-left {
  display: flex;
  align-items: center;
  padding: 15px;
  gap: 15px;
}

.disc-container {
  position: relative;
}

.radio-disc {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 32px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.decorative-box {
  width: 50px;
  height: 50px;
  position: relative;
  border-radius: 12px;
  transform: perspective(500px) rotateY(-15deg);
  transition: transform 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.15);
}

.music-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 30px;
}

.bar {
  width: 3px;
  background: white;
  border-radius: 3px;
  animation: sound-wave 1.2s ease-in-out infinite;
}

.bar:nth-child(1) {
  height: 15px;
  animation-delay: 0s;
}

.bar:nth-child(2) {
  height: 20px;
  animation-delay: 0.2s;
}

.bar:nth-child(3) {
  height: 12px;
  animation-delay: 0.4s;
}

.bar:nth-child(4) {
  height: 18px;
  animation-delay: 0.6s;
}

@keyframes sound-wave {
  0%, 100% {
    transform: scaleY(1);
  }
  50% {
    transform: scaleY(0.5);
  }
}

.play-button {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
  margin-left: auto;
}

.play-button:hover {
  transform: scale(1.1);
  background: var(--primary-color);
}

.play-button i {
  color: #667eea;
  font-size: 16px;
}

.play-button:hover i {
  color: white;
}

.radio-content {
  padding: 15px;
  text-align: center;
}

.radio-title {
  font-size: 18px;
  font-weight: bold;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
}

.heart-icon {
  font-size: 18px;
}

.shuffle-icon {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: transform 0.3s ease;
}

.shuffle-icon:hover {
  transform: scale(1.1);
  color: white;
}

.radio-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}

.ranking-entry {
  display: block;
  width: 100%;
  height: 100%;
  text-decoration: none;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 15px;
  overflow: hidden;
}

.ranking-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
}

.ranking-icon {
  font-size: 48px;
  margin-bottom: 10px;
}

.ranking-title {
  font-size: 20px;
  font-weight: bold;
  margin: 0 0 5px 0;
}

.ranking-description {
  font-size: 14px;
  opacity: 0.9;
}

.playlist-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  border-radius: 15px;
  background: linear-gradient(135deg, #667eea, #cfff82);
  color: white;
  text-align: center;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  overflow: hidden;
}

.playlist-entry:hover {
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
}

.playlist-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.playlist-icon {
  font-size: 48px;
  margin-bottom: 10px;
}

.section-title {
  font-size: 20px;
  font-weight: bold;
  margin: 20px 0 20px 0;
  color: white;
}

.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 5px;
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.3s;
  font-size: 13px;
}

.tab-btn i {
  font-size: 14px;
}

.tab-btn span {
  font-size: 13px;
}

.tab-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.tab-btn.active {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-weight: 600;
}

.songs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.song-card {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.song-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.song-cover {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  margin-right: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.song-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
}

.song-info {
  flex: 1;
  min-width: 0;
}

.song-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  font-size: 13px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.playlist-item {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.playlist-item a {
  text-decoration: none;
  color: inherit;
  display: block;
  width: 100%;
  height: 100%;
}

.playlist-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.playlist-cover {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}

.playlist-info {
  padding: 12px;
}

.playlist-title {
  font-weight: bold;
  margin-bottom: 5px;
  font-size: 14px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-description {
  color: #666;
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  max-height: 40px;
  line-height: 20px;
}

@media (max-width: 768px) {
  .home-container {
    padding: 12px;
  }

  .recommendations {
    gap: 12px;
  }

  .radio-left {
    padding: 12px;
    gap: 12px;
  }

  .radio-disc {
    width: 60px;
    height: 60px;
    font-size: 24px;
  }

  .decorative-box {
    width: 40px;
    height: 40px;
  }

  .play-button {
    width: 36px;
    height: 36px;
  }

  .radio-title {
    font-size: 16px;
  }

  .radio-subtitle {
    font-size: 13px;
  }

  .ranking-icon {
    font-size: 40px;
  }

  .ranking-title {
    font-size: 18px;
  }

  .ranking-description {
    font-size: 13px;
  }

  .playlist-icon {
    font-size: 40px;
  }

  .section-title {
    font-size: 18px;
    margin: 15px 0 15px 0;
  }

  .song-card {
    padding: 10px;
    gap: 10px;
  }

  .song-cover {
    width: 45px;
    height: 45px;
  }

  .song-title {
    font-size: 14px;
  }

  .song-artist {
    font-size: 12px;
  }

  .action-btn {
    width: 32px;
    height: 32px;
  }

  .playlist-grid {
    gap: 10px;
  }

  .playlist-title {
    font-size: 13px;
  }

  .playlist-description {
    font-size: 11px;
  }
}

@media (max-width: 480px) {
  .home-container {
    padding: 10px;
  }

  .recommendations {
    gap: 10px;
  }

  .radio-left {
    padding: 10px;
    gap: 10px;
  }

  .radio-disc {
    width: 50px;
    height: 50px;
    font-size: 20px;
  }

  .decorative-box {
    width: 35px;
    height: 35px;
  }

  .play-button {
    width: 32px;
    height: 32px;
  }

  .radio-title {
    font-size: 14px;
  }

  .radio-subtitle {
    font-size: 12px;
  }

  .ranking-icon {
    font-size: 36px;
  }

  .ranking-title {
    font-size: 16px;
  }

  .ranking-description {
    font-size: 12px;
  }

  .playlist-icon {
    font-size: 36px;
  }

  .section-title {
    font-size: 16px;
    margin: 12px 0 12px 0;
  }

  .song-card {
    padding: 8px;
    gap: 8px;
  }

  .song-cover {
    width: 40px;
    height: 40px;
  }

  .song-title {
    font-size: 13px;
  }

  .song-artist {
    font-size: 11px;
  }

  .action-btn {
    width: 28px;
    height: 28px;
  }

  .playlist-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }

  .playlist-title {
    font-size: 14px;
  }

  .playlist-description {
    font-size: 12px;
  }
}
</style>
