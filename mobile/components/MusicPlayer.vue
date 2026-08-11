<template>
  <div>
    <div class="music-player-container" v-if="currentSong">
      <div class="music-player" v-if="currentSong">
        <div class="player-content">
          <div class="song-info">
            <div class="song-cover" @click="toggleLyricsFullScreen">
              <img 
                v-if="currentSongCover" 
                :src="currentSongCover" 
                alt="封面" 
              />
              <div v-else class="cover-placeholder">
                <i class="fas fa-music"></i>
              </div>
            </div>
            <div class="song-meta">
              <div class="song-title">{{ currentSongName }}</div>
              <div class="song-info-row">
                <span class="song-artist" @click="goToArtistDetail">{{ currentSongArtist }}</span>
                <span v-if="getAlbumName(currentSong)" class="separator"> - </span>
                <span v-if="getAlbumName(currentSong)" class="song-album" @click="goToAlbumDetail">{{ getAlbumName(currentSong) }}</span>
              </div>
            </div>
          </div>

          <div class="controls">
            <button class="control-btn play-btn" @click="togglePlay">
              <i v-if="!isPlaying" class="fas fa-play"></i>
              <i v-else class="fas fa-pause"></i>
            </button>
            <button class="control-btn" @click="togglePlaylist">
              <i class="fas fa-list"></i>
            </button>
          </div>
        </div>

        <div class="progress-section-mini">
          <div class="time-display-mini">
            <span>{{ formattedCurrentTime }}</span>
          </div>
          <div class="progress-bar-mini" @click="handleProgressClick">
            <div class="progress-bg-mini"></div>
            <div class="progress-fill-mini" :style="{ width: progress + '%' }"></div>
            <div class="progress-handle-mini" :style="{ left: progress + '%' }"></div>
          </div>
          <div class="time-display-mini">
            <span>{{ formattedDuration }}</span>
          </div>
        </div>

        <audio 
          ref="audioElement"
          :src="audioUrl"
          @timeupdate="handleTimeUpdate"
          @loadedmetadata="handleLoadedMetadata"
          @ended="handleEnded"
          @error="handleError"
          @canplay="handleCanPlay"
        ></audio>
      </div>

      <DownloadManager
        ref="downloadManager"
        :song="currentSong"
        @download-start="handleDownloadStart"
        @download-complete="handleDownloadComplete"
        @download-fail="handleDownloadFail"
        @quality-select="handleQualitySelect"
      />
    </div>

    <div class="fullscreen-container" :class="{ 'playlist-view': fullscreenView === 'playlist', 'lyrics-view': fullscreenView === 'lyrics' }" v-if="showLyricsFullScreen || showPlaylist">
      <div class="fullscreen-content">
        <template v-if="fullscreenView === 'lyrics' && currentSong">
          <div class="song-info-top">
            <div class="song-cover-full">
              <img 
                v-if="currentSongCover" 
                :src="currentSongCover" 
                alt="封面" 
              />
              <div v-else class="cover-placeholder">
                <i class="fas fa-music"></i>
              </div>
            </div>
            <div class="song-meta-full">
              <h2>{{ currentSongName }}</h2>
              <div class="artist-album">
                <span @click="goToArtistDetail">{{ currentSongArtist }}</span>
                <span v-if="getAlbumName(currentSong)" class="album-separator">·</span>
                <span v-if="getAlbumName(currentSong)" @click="goToAlbumDetail">{{ getAlbumName(currentSong) }}</span>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="custom-dropdown" ref="dropdownRef">
            <button 
              class="dropdown-trigger" 
              @click="toggleDropdown"
            >
              <span class="dropdown-text">
                {{ selectedPlaylistName }}
              </span>
              <i class="fas fa-chevron-down dropdown-arrow" :class="{ 'rotated': showDropdown }"></i>
            </button>
            <button 
              class="play-playlist-btn"
              @click="playSelectedPlaylist"
              title="播放歌单"
              v-if="(!selectedPlaylistId && playlist.length > 0) || (selectedPlaylistId && userPlaylist.length > 0)"
            >
              <i class="fas fa-play"></i>
              <span>播放全部</span>
            </button>
            <div class="dropdown-options" v-show="showDropdown">
              <div 
                class="dropdown-option" 
                :class="{ 'active': !selectedPlaylistId }"
                @click="selectPlaylist('')"
              >
                <span>播放列表({{ playlist.length }})</span>
              </div>
              <div 
                v-for="userPlaylist in userPlaylists" 
                :key="userPlaylist.list_id"
                class="dropdown-option"
                :class="{ 'active': selectedPlaylistId === (userPlaylist.global_collection_id || userPlaylist.list_create_gid) }"
                @click="selectPlaylist(userPlaylist.global_collection_id || userPlaylist.list_create_gid)"
              >
                <span>{{ userPlaylist.name }}({{ userPlaylist.count }})</span>
              </div>
            </div>
          </div>
        </template>
        <button 
          class="clear-playlist-btn-full" 
          @click="clearPlaylist"
          v-if="fullscreenView === 'playlist' && playlist.length > 0"
          title="清空列表"
        >
          <i class="fas fa-trash"></i>
        </button>
        <button class="close-btn" @click="closeFullscreen">
          <i class="fas fa-times"></i>
        </button>
        
        <div class="lyrics-content" v-show="fullscreenView === 'lyrics' && currentSong" ref="lyricsContent">
          <div 
            v-for="(line, index) in parsedLyrics" 
            :key="index"
            class="lyric-line"
            :class="{ active: currentLyricIndex === index }"
          >
            {{ line.text }}
          </div>
          <div v-if="!parsedLyrics.length" class="no-lyrics">
            暂无歌词
          </div>
        </div>
        
        <div class="playlist-content-full" v-show="fullscreenView === 'playlist'">
          <div v-if="currentPlaylist.length === 0" class="empty-playlist-full">
            <i class="fas fa-music"></i>
            <p>{{ playSource === 'playlist' ? '播放列表为空' : '歌单为空' }}</p>
          </div>
          <div v-else class="playlist-list-full">
            <div 
              v-for="(song, index) in currentPlaylist" 
              :key="song.hash"
              class="playlist-item-full"
              :class="{ active: currentSong && currentSong.hash === song.hash }"
              @click="playPlaylistSong(song)"
            >
              <div class="playlist-item-index-full" :class="{ 'current': currentSong && currentSong.hash === song.hash }">
                <div v-if="currentSong && currentSong.hash === song.hash && isPlaying" class="sound-wave">
                  <span></span><span></span><span></span>
                </div>
                <span v-else>{{ index + 1 }}</span>
              </div>
              <div class="playlist-item-title-container-full">
                <div class="playlist-item-title-full" :title="getSongName(song)">{{ getSongName(song) }}</div>
              </div>
              <div class="playlist-item-artist-full" :title="getSongArtist(song)">{{ getSongArtist(song) }}</div>
              <div class="playlist-item-timelen-full">
                <button v-if="currentSong && currentSong.hash === song.hash"
                  class="queue-play-btn fas fa-music"></button>
                {{ formatMilliseconds(song.timeLength) }}
                <div class="track-actions">
                  <button 
                    class="play-btn" 
                    @click.stop="playPlaylistSong(song)" 
                    title="播放"
                  >
                    <i class="fas fa-play"></i>
                  </button>
                  <button 
                    v-if="playSource === 'playlist'"
                    class="remove-btn" 
                    @click.stop="removeFromPlaylist(song.hash)" 
                    title="删除"
                  >
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="fullscreen-footer" v-show="fullscreenView === 'lyrics' && currentSong">
          <div class="progress-section">
            <div class="time-display">
              <span>{{ formattedCurrentTime }}</span>
              <span>{{ formattedDuration }}</span>
            </div>
            <div class="progress-bar" @click="handleProgressClick">
              <div class="progress-bg"></div>
              <div class="progress-fill" :style="{ width: progress + '%' }"></div>
              <div class="progress-handle" :style="{ left: progress + '%' }"></div>
            </div>
          </div>
          
          <div class="controls">
            <button class="control-btn" @click="togglePlayMode" title="播放模式">
              <div v-if="playMode === 'list'" class="play-mode-icon">
                <i class="fas fa-redo"></i>
              </div>
              <div v-else-if="playMode === 'single'" class="play-mode-icon single-loop">
                <i class="fas fa-redo"></i>
                <span class="loop-number">1</span>
              </div>
              <div v-else class="play-mode-icon">
                <i class="fas fa-random"></i>
              </div>
            </button>
            <button class="control-btn" @click="toggleTimer">
              <i class="fas fa-clock"></i>
            </button>
            <button class="control-btn" @click="playPrevious">
              <i class="fas fa-step-backward"></i>
            </button>
            <button class="control-btn play-btn" @click="togglePlay">
              <i v-if="!isPlaying" class="fas fa-play"></i>
              <i v-else class="fas fa-pause"></i>
            </button>
            <button class="control-btn" @click="playNext">
              <i class="fas fa-step-forward"></i>
            </button>
            <button class="control-btn" @click="downloadSong">
              <i class="fas fa-download"></i>
            </button>
            <button class="control-btn" @click="togglePlaylist" title="播放列表">
              <i class="fas fa-list"></i>
            </button>
          </div>
        </div>
        
        <div class="playlist-footer" v-show="fullscreenView === 'playlist' && currentSong">
          <div class="progress-section">
            <div class="time-display">
              <span>{{ formattedCurrentTime }}</span>
              <span>{{ formattedDuration }}</span>
            </div>
            <div class="progress-bar" @click="handleProgressClick">
              <div class="progress-bg"></div>
              <div class="progress-fill" :style="{ width: progress + '%' }"></div>
              <div class="progress-handle" :style="{ left: progress + '%' }"></div>
            </div>
          </div>
          
          <div class="controls">
            <button class="control-btn" @click="togglePlayMode" title="播放模式">
              <div v-if="playMode === 'list'" class="play-mode-icon">
                <i class="fas fa-redo"></i>
              </div>
              <div v-else-if="playMode === 'single'" class="play-mode-icon single-loop">
                <i class="fas fa-redo"></i>
                <span class="loop-number">1</span>
              </div>
              <div v-else class="play-mode-icon">
                <i class="fas fa-random"></i>
              </div>
            </button>
            <button class="control-btn" @click="toggleTimer">
              <i class="fas fa-clock"></i>
            </button>
            <button class="control-btn" @click="playPrevious">
              <i class="fas fa-step-backward"></i>
            </button>
            <button class="control-btn play-btn" @click="togglePlay">
              <i v-if="!isPlaying" class="fas fa-play"></i>
              <i v-else class="fas fa-pause"></i>
            </button>
            <button class="control-btn" @click="playNext">
              <i class="fas fa-step-forward"></i>
            </button>
            <button class="control-btn" @click="downloadSong">
              <i class="fas fa-download"></i>
            </button>
            <button class="control-btn" @click="toggleLyricsFullScreen" title="歌词">
              词
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 确认弹窗 -->
    <div class="confirm-dialog" v-if="showConfirmDialog">
      <div class="confirm-dialog-overlay" @click="showConfirmDialog = false"></div>
      <div class="confirm-dialog-content">
        <div class="confirm-dialog-header">
          <h3>{{ confirmDialogTitle }}</h3>
        </div>
        <div class="confirm-dialog-body">
          <p>{{ confirmDialogMessage }}</p>
        </div>
        <div class="confirm-dialog-footer">
          <button class="confirm-btn cancel" @click="showConfirmDialog = false">取消</button>
          <button class="confirm-btn confirm" @click="handleConfirmDialogConfirm">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { get } from '../utils/request'
import { MoeAuthStore } from '../stores/store'
import DownloadManager from './DownloadManager.vue'
import message from '../utils/message'

const router = useRouter()
const MoeAuth = MoeAuthStore()
const audioElement = ref(null)
const audioUrl = ref('')
const lyricsContent = ref(null)
const downloadManager = ref(null)

const showLyricsFullScreen = ref(false)
const lyrics = ref('')
const parsedLyrics = ref([])
const currentLyricIndex = ref(-1)

const showPlaylist = ref(false)
const playlist = ref([])
const userPlaylist = ref([])
const selectedPlaylistId = ref('')
const userPlaylists = ref([])
const showDropdown = ref(false)
const dropdownRef = ref(null)
const fullscreenView = ref('lyrics')

// 从本地存储加载播放列表
const loadPlaylistFromLocalStorage = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedPlaylist = localStorage.getItem('moeKoeG_playlist')
      if (savedPlaylist) {
        playlist.value = JSON.parse(savedPlaylist)
        console.log('从本地存储加载播放列表:', playlist.value)
      }
    }
  } catch (error) {
    console.error('加载本地播放列表失败:', error)
  }
}

// 保存播放列表到本地存储
const savePlaylistToLocalStorage = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('moeKoeG_playlist', JSON.stringify(playlist.value))
      console.log('播放列表已保存到本地存储')
    }
  } catch (error) {
    console.error('保存本地播放列表失败:', error)
  }
}

// 监听播放列表变化，自动保存到本地存储
watch(() => playlist.value, () => {
  savePlaylistToLocalStorage()
}, { deep: true })

// 确认弹窗状态
const showConfirmDialog = ref(false)
const confirmDialogTitle = ref('确认操作')
const confirmDialogMessage = ref('')
const confirmDialogCallback = ref(null)

const playMode = ref('list')
const timerSeconds = ref(0)
const timerInterval = ref(null)

const currentSong = ref(null)
const currentAlbum = ref(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(0.66)

const getSongName = (song) => {
  return song.name || song.ori_audio_name || song.songname || '未知歌曲'
}

const getSongArtist = (song) => {
  return song.author || song.author_name || song.singer_name || '未知歌手'
}

const getSongArtistId = async (song) => {
  // 通过 hash 调用 /images 接口获取准确的 author_id
  if (song.hash) {
    try {
      const res = await get('/images', { hash: song.hash })
      const author = res?.data?.[0]?.author?.[0]
      if (author && author.author_id) {
        return author.author_id
      }
    } catch (e) {
      console.error('获取歌手ID失败:', e)
    }
  }
  // 兜底：使用歌曲自带字段
  return song.singerid || song.AuthorId || song.author_id || currentAlbum.value?.authors?.[0]?.author_id || null
}

const getAlbumId = (song) => {
  return currentAlbum.value?.album_id || song.album_id || song.albumid || null
}

const getAlbumName = (song) => {
  return currentAlbum.value?.album_name || song.album_name || song.album || ''
}

const getSongCover = (song) => {
  if (!song) return null
  
  if (song.sizable_cover) {
    return song.sizable_cover.replace('{size}', '480').replace(/[`]/g, '').trim()
  }
  
  if (song.img) {
    return song.img.replace(/[`]/g, '').trim()
  }
  
  if (song.union_cover) {
    return song.union_cover.replace('{size}', '480').replace(/[`]/g, '').trim()
  }
  
  return null
}

const currentPlaylist = computed(() => {
  return selectedPlaylistId.value ? userPlaylist.value : playlist.value
})

const selectedPlaylistName = computed(() => {
  if (selectedPlaylistId.value) {
    const playlist = userPlaylists.value.find(p => 
      p.global_collection_id === selectedPlaylistId.value || p.list_create_gid === selectedPlaylistId.value
    )
    return playlist ? `${playlist.name}(${playlist.count})` : '播放列表'
  }
  return `播放列表(${playlist.value.length})`
})

const currentSongName = computed(() => {
  if (!currentSong.value) return '未知歌曲'
  return getSongName(currentSong.value)
})

const currentSongArtist = computed(() => {
  if (!currentSong.value) return '未知歌手'
  return getSongArtist(currentSong.value)
})

const currentSongCover = computed(() => {
  if (!currentSong.value) return null
  return getSongCover(currentSong.value)
})

const formattedCurrentTime = computed(() => {
  const minutes = Math.floor(currentTime.value / 60)
  const seconds = Math.floor(currentTime.value % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

const formattedDuration = computed(() => {
  const minutes = Math.floor(duration.value / 60)
  const seconds = Math.floor(duration.value % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

const formatMilliseconds = (ms) => {
  if (!ms || isNaN(ms)) return '--:--'
  // 检查是否是秒数格式（如果值小于 60000，可能是秒）
  const milliseconds = ms < 60000 ? ms * 1000 : ms
  const minutes = Math.floor(milliseconds / 1000 / 60)
  const seconds = Math.floor((milliseconds / 1000) % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const progress = computed(() => {
  if (duration.value === 0) return 0
  return (currentTime.value / duration.value) * 100
})

const togglePlay = () => {
  if (audioElement.value) {
    if (isPlaying.value) {
      audioElement.value.pause()
      isPlaying.value = false
    } else {
      audioElement.value.play()
      isPlaying.value = true
    }
  }
}

const playNext = () => {
  const currentPlayList = currentPlaylist.value
  if (currentPlayList.length === 0) return
  
  const currentIndex = currentPlayList.findIndex(song => song.hash === currentSong.value?.hash)
  let nextIndex
  
  if (playMode.value === 'random') {
    nextIndex = Math.floor(Math.random() * currentPlayList.length)
  } else {
    nextIndex = (currentIndex + 1) % currentPlayList.length
  }
  
  playSong(currentPlayList[nextIndex])
}

const playPrevious = () => {
  const currentPlayList = currentPlaylist.value
  if (currentPlayList.length === 0) return
  
  const currentIndex = currentPlayList.findIndex(song => song.hash === currentSong.value?.hash)
  let prevIndex
  
  if (playMode.value === 'random') {
    prevIndex = Math.floor(Math.random() * currentPlayList.length)
  } else {
    prevIndex = currentIndex <= 0 ? currentPlayList.length - 1 : currentIndex - 1
  }
  
  playSong(currentPlayList[prevIndex])
}

const togglePlayMode = () => {
  const modes = ['list', 'single', 'random']
  const currentIndex = modes.indexOf(playMode.value)
  playMode.value = modes[(currentIndex + 1) % modes.length]
}

const toggleTimer = () => {
  if (timerSeconds.value > 0) {
    timerSeconds.value = 0
    if (timerInterval.value) {
      clearInterval(timerInterval.value)
      timerInterval.value = null
    }
  } else {
    timerSeconds.value = 15 * 60
    startTimer()
  }
}

const startTimer = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
  }
  
  timerInterval.value = setInterval(() => {
    timerSeconds.value--
    if (timerSeconds.value <= 0) {
      clearInterval(timerInterval.value)
      timerInterval.value = null
      if (isPlaying.value) {
        togglePlay()
      }
    }
  }, 1000)
}

const downloadSong = () => {
  if (!currentSong.value || !audioUrl.value) return
  
  if (downloadManager.value) {
    downloadManager.value.startDownloadProcess()
  }
}

const handleDownloadStart = (song, quality) => {
  console.log('下载开始:', song.name || song.ori_audio_name || song.songname, quality.name || quality.quality)
}

const handleDownloadComplete = (song, url, quality) => {
  console.log('下载完成:', song.name || song.ori_audio_name || song.songname, url)
}

const handleDownloadFail = (song, error) => {
  console.error('下载失败:', song.name || song.ori_audio_name || song.songname, error.message)
}

const handleQualitySelect = (quality) => {
  console.log('选择音质:', quality.name || quality.quality)
}

const togglePlaylist = () => {
  if (showLyricsFullScreen.value) {
    showLyricsFullScreen.value = false
    showPlaylist.value = true
    fullscreenView.value = 'playlist'
  } else {
    showPlaylist.value = !showPlaylist.value
    if (showPlaylist.value) {
      fullscreenView.value = 'playlist'
    }
  }
}

const addToPlaylist = (song) => {
  if (!song || !song.hash) return
  
  const exists = playlist.value.find(s => s.hash === song.hash)
  if (!exists) {
    playlist.value.push(song)
  }
}

const setUserPlaylist = (songs) => {
  userPlaylist.value = songs || []
}

const loadUserPlaylist = async (playlistId) => {
  if (!playlistId) return
  
  try {
    const response = await get('/playlist/track/all', {
      id: playlistId,
      pagesize: 1000
    })
    
    console.log('歌单歌曲响应:', response)
    
    if (response.status === 1) {
      const rawSongs = response.data?.songs || []
      console.log('原始歌曲数据:', rawSongs)
      userPlaylist.value = rawSongs
        .filter(track => !!track.hash)
        .map(track => {
          const nameParts = track.name.split(' - ')
          return {
            hash: track.hash || '',
            name: nameParts.length > 1 ? nameParts[1] : track.name,
            author: nameParts.length > 1 ? nameParts[0] : '',
            img: track.cover?.replace('{size}', 480) || '',
            timeLength: track.timelen || track.duration || track.time_length || track.TimeLength || 0
          }
        })
      console.log('处理后的歌单歌曲:', userPlaylist.value)
      return userPlaylist.value.length > 0
    } else {
      window.$modal.alert('加载歌单歌曲失败')
      return false
    }
  } catch (error) {
    console.error('加载歌单失败:', error)
    window.$modal.alert('加载歌单失败')
    return false
  }
}

const refreshUserPlaylists = async () => {
  if (!MoeAuth.isAuthenticated) {
    return
  }
  
  try {
    const response = await get('/user/playlist', { pagesize: 100 })
    console.log('歌单列表响应:', response)
    if (response.status === 1) {
      userPlaylists.value = response.data.info.filter(
        playlist => playlist.list_create_userid === MoeAuth.UserInfo.userid
      )
      console.log('用户歌单列表:', userPlaylists.value)
      console.log('歌单列表详细信息:', userPlaylists.value.map(p => ({
        name: p.name,
        list_id: p.list_id,
        global_collection_id: p.global_collection_id,
        list_create_gid: p.list_create_gid,
        count: p.count
      })))
      if (userPlaylists.value.length === 0) {
        window.$modal.alert('暂无歌单，请先创建歌单')
      }
    } else {
      window.$modal.alert('获取歌单列表失败')
    }
  } catch (error) {
    console.error('获取歌单列表失败:', error)
    window.$modal.alert('获取歌单列表失败')
  }
}

const handlePlaylistChange = async (event) => {
  const playlistId = event.target.value
  console.log('选择的歌单ID:', playlistId)
  console.log('选择的歌单ID类型:', typeof playlistId)
  
  selectedPlaylistId.value = playlistId
  
  if (playlistId) {
    console.log('开始加载歌单歌曲，歌单ID:', playlistId)
    await loadUserPlaylist(playlistId)
  }
}

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value
}

const selectPlaylist = async (playlistId) => {
  selectedPlaylistId.value = playlistId
  showDropdown.value = false
  
  if (playlistId) {
    console.log('开始加载歌单歌曲，歌单ID:', playlistId)
    await loadUserPlaylist(playlistId)
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const handleClickOutside = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    showDropdown.value = false
  }
}

const playSelectedPlaylist = async () => {
  if (!selectedPlaylistId.value) {
    window.$modal.alert('请先选择歌单')
    return
  }
  
  if (userPlaylist.value.length === 0) {
    window.$modal.alert('歌单为空')
    return
  }
  
  playSong(userPlaylist.value[0])
}

const removeFromPlaylist = (hash) => {
  playlist.value = playlist.value.filter(song => song.hash !== hash)
}

const clearPlaylist = () => {
  showConfirm(
    '清空播放列表',
    '确定要清空播放列表吗？此操作不可恢复。',
    () => {
      playlist.value = []
      savePlaylistToLocalStorage()
    }
  )
}

const playPlaylistSong = (song) => {
  playSong(song)
}

const handleTimeUpdate = () => {
  if (audioElement.value) {
    currentTime.value = audioElement.value.currentTime
    if (showLyricsFullScreen.value && fullscreenView.value === 'lyrics') {
      updateCurrentLyricIndex()
    }
  }
}

const handleLoadedMetadata = () => {
  if (audioElement.value) {
    duration.value = audioElement.value.duration
    console.log('音频时长:', duration.value)
  }
}

const handleEnded = () => {
  if (playMode.value === 'single') {
    if (audioElement.value) {
      audioElement.value.currentTime = 0
      audioElement.value.play()
    }
  } else {
    isPlaying.value = false
    currentTime.value = 0
    playNext()
  }
}

const handleProgressClick = (event) => {
  const rect = event.currentTarget.getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  if (audioElement.value) {
    audioElement.value.currentTime = percent * audioElement.value.duration
  }
}

const handleVolumeChange = () => {
  if (audioElement.value) {
    audioElement.value.volume = volume.value
  }
}

const handleError = (event) => {
  console.error('音频加载失败:', event)
}

const handleCanPlay = () => {
  if (audioElement.value && isPlaying.value) {
    audioElement.value.play()
  }
}

const toggleLyricsFullScreen = async () => {
  if (showPlaylist.value) {
    showPlaylist.value = false
    showLyricsFullScreen.value = true
    fullscreenView.value = 'lyrics'
    if (currentSong.value) {
      await loadLyrics()
    }
  } else {
    showLyricsFullScreen.value = !showLyricsFullScreen.value
    
    if (showLyricsFullScreen.value) {
      fullscreenView.value = 'lyrics'
      if (currentSong.value) {
        await loadLyrics()
      }
    }
  }
}

const closeFullscreen = () => {
  showLyricsFullScreen.value = false
  showPlaylist.value = false
}

const handleConfirmDialogConfirm = () => {
  if (confirmDialogCallback.value) {
    confirmDialogCallback.value()
  }
  showConfirmDialog.value = false
}

const showConfirm = (title, message, callback) => {
  confirmDialogTitle.value = title
  confirmDialogMessage.value = message
  confirmDialogCallback.value = callback
  showConfirmDialog.value = true
}

const loadLyrics = async () => {
  if (!currentSong.value || !currentSong.value.hash) return
  
  try {
    const lyricSearchResponse = await get(`/search/lyric?hash=${currentSong.value.hash}`)
    if (lyricSearchResponse.status === 200 && lyricSearchResponse.candidates && lyricSearchResponse.candidates.length > 0) {
      const candidate = lyricSearchResponse.candidates[0]
      const lyricResponse = await get(`/lyric?id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&decode=true`)
      
      if (lyricResponse.status === 200 && lyricResponse.decodeContent) {
        lyrics.value = lyricResponse.decodeContent
        parseLyrics()
      }
    }
  } catch (error) {
    console.error('加载歌词失败:', error)
    lyrics.value = ''
    parsedLyrics.value = []
  }
}

const parseLyrics = () => {
  if (!lyrics.value) {
    parsedLyrics.value = []
    return
  }
  
  const lines = lyrics.value.split('\n')
  const result = []
  
  const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g
  
  lines.forEach(line => {
    const times = []
    let match
    timeRegex.lastIndex = 0
    
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1])
      const seconds = parseInt(match[2])
      const milliseconds = parseInt(match[3])
      const totalSeconds = minutes * 60 + seconds + milliseconds / 1000
      times.push(totalSeconds)
    }
    
    const text = line.replace(timeRegex, '').trim()
    if (text && times.length > 0) {
      times.forEach(time => {
        result.push({ time, text })
      })
    }
  })
  
  result.sort((a, b) => a.time - b.time)
  parsedLyrics.value = result
  console.log('解析完成的歌词:', parsedLyrics.value)
}

const updateCurrentLyricIndex = () => {
  if (!parsedLyrics.value.length || !audioElement.value) {
    currentLyricIndex.value = -1
    return
  }
  
  const currentTimeMs = audioElement.value.currentTime
  let index = -1
  
  for (let i = 0; i < parsedLyrics.value.length; i++) {
    const currentLyricTime = parsedLyrics.value[i].time
    const nextLyricTime = i < parsedLyrics.value.length - 1 ? parsedLyrics.value[i + 1].time : Infinity
    
    if (currentLyricTime <= currentTimeMs && currentTimeMs < nextLyricTime) {
      index = i
      break
    }
  }
  
  if (index === -1) {
    for (let i = parsedLyrics.value.length - 1; i >= 0; i--) {
      if (parsedLyrics.value[i].time <= currentTimeMs) {
        index = i
        break
      }
    }
  }
  
  if (index !== currentLyricIndex.value) {
    currentLyricIndex.value = index
    scrollToCurrentLyric()
  }
}

const scrollToCurrentLyric = () => {
  if (!lyricsContent.value || currentLyricIndex.value === -1) return
  
  const lyricElements = lyricsContent.value.children
  if (lyricElements[currentLyricIndex.value]) {
    const element = lyricElements[currentLyricIndex.value]
    const containerHeight = lyricsContent.value.clientHeight
    const elementTop = element.offsetTop
    const elementHeight = element.clientHeight
    
    lyricsContent.value.scrollTop = elementTop - containerHeight / 2 + elementHeight / 2
  }
}

const loadAudio = async (song) => {
  if (!song || !song.hash) return
  
  try {
    console.log('开始加载音频:', getSongName(song))
    
    if (MoeAuth.isAuthenticated) {
      await MoeAuth.autoClaimVip()
    }
    
    const data = { hash: song.hash }
    
    if (!MoeAuth.isAuthenticated || !MoeAuth.isVip) {
      data.free_part = 1
    }
    
    const response = await get('/song/url', data)
    
    if (response.status === 1 && response.url && response.url[0]) {
      audioUrl.value = response.url[0]
      if (audioElement.value) {
        audioElement.value.load()
      }
      
      await loadAlbumInfo(song.hash)
    } else {
      console.error('获取音频链接失败')
    }
  } catch (error) {
    console.error('加载音频失败:', error)
    const errorData = error.response?.data
    const errorMsg = errorData?.error || errorData?.msg || error.message
    
    if (errorMsg?.includes('需要验证') || errorMsg?.includes('需要登录') || errorData?.errcode === 20028) {
      isPlaying.value = false
      currentSong.value = null
      audioUrl.value = ''
      message.error('请先登录')
      router.push('/login')
    }
  }
}

const loadAlbumInfo = async (hash) => {
  try {
    console.log('开始加载专辑信息，hash:', hash)
    const response = await get('/privilege/lite', { hash })
    console.log('privilege/lite 响应:', response)
    
    if (response.status === 1 && response.data && response.data.length > 0) {
      const songData = response.data[0]
      console.log('歌曲数据:', songData)
      
      const albumId = songData.recommend_album_id || songData.album_id
      console.log('获取到 albumId:', albumId)
      
      if (albumId && albumId !== '0') {
        const albumResponse = await get('/album/detail', { id: albumId })
        console.log('album/detail 响应:', albumResponse)
        
        if (albumResponse.status === 1 && albumResponse.data && albumResponse.data.length > 0) {
          currentAlbum.value = albumResponse.data[0]
          console.log('专辑信息加载成功:', currentAlbum.value)
        } else {
          console.log('album/detail 响应格式不正确')
        }
      } else {
        console.log('album_id 不存在或为0')
      }
    } else {
      console.log('privilege/lite 响应格式不正确')
    }
  } catch (error) {
    console.error('加载专辑信息失败:', error)
  }
}

const playSong = (song) => {
  currentSong.value = song
  loadAudio(song)
  isPlaying.value = true
  if (audioElement.value) {
    setTimeout(() => {
      audioElement.value.play()
    }, 300)
  }
}

const goToArtistDetail = async () => {
  if (!currentSong.value) return

  const artistId = await getSongArtistId(currentSong.value)

  if (artistId) {
    closeFullscreen()
    router.push({
      name: 'PlaylistDetail',
      query: { singerid: artistId }
    })
  }
}

const goToAlbumDetail = () => {
  console.log('goToAlbumDetail called')
  console.log('currentSong.value:', currentSong.value)
  console.log('currentAlbum.value:', currentAlbum.value)
  
  if (!currentSong.value) {
    console.log('currentSong is null')
    return
  }
  
  const albumId = getAlbumId(currentSong.value)
  console.log('albumId:', albumId)
  
  if (albumId) {
    console.log('navigating to album detail:', albumId)
    closeFullscreen()
    router.push({
      name: 'PlaylistDetail',
      query: { albumid: albumId }
    })
  } else {
    console.log('albumId not found')
  }
}

onMounted(() => {
  if (audioElement.value) {
    audioElement.value.volume = volume.value
  }
  
  // 从本地存储加载播放列表
  loadPlaylistFromLocalStorage()
  
  if (typeof window !== 'undefined') {
    window.playerControl = {
      addSongToQueue: (hash, name, cover, author, timelen, extraData) => {
        const song = { hash, name, img: cover, author, timeLength: timelen, ...(extraData || {}) }
        playSong(song)
      },
      addToPlaylist: (hash, name, cover, author, timelen, extraData) => {
        const song = { hash, name, img: cover, author, timeLength: timelen, ...(extraData || {}) }
        addToPlaylist(song)
      },
      addPlaylistToQueue: (songs) => {
        if (!songs || songs.length === 0) return
        playlist.value = songs.map(song => ({
          hash: song.hash,
          name: song.name,
          img: song.cover?.replace('{size}', 480) || song.img || '',
          author: song.author,
          timeLength: song.timelen || song.duration || song.time_length || song.TimeLength || 0
        }))
        playSong(playlist.value[0])
      }
    }
    
    window.musicPlayer = {
      playSong,
      addToPlaylist,
      setUserPlaylist,
      loadUserPlaylist
    }
    
    refreshUserPlaylists()
  }
})

onUnmounted(() => {
  if (audioElement.value) {
    audioElement.value.pause()
  }
})

const hasCurrentSong = computed(() => {
  return currentSong.value !== null && currentSong.value !== undefined
})

defineExpose({
  playSong,
  addToPlaylist,
  setUserPlaylist,
  loadUserPlaylist,
  hasCurrentSong
})
</script>

<style scoped>
.music-player-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  margin: 0;
  padding: 0;
  height: auto;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%);
  backdrop-filter: blur(20px);
  box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.music-player {
  margin: 0;
  padding: 0;
  width: 100%;
}

.player-content {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 15px;
  width: 100%;
  box-sizing: border-box;
}

.song-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.song-cover {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.3s ease;
}

.song-cover:hover {
  transform: scale(1.05);
}

.song-cover img,
.song-cover .cover-placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.song-cover .cover-placeholder i {
  font-size: 20px;
  color: rgba(255, 255, 255, 0.5);
}

.song-meta {
  flex: 1;
  min-width: 0;
}

.song-title {
  font-size: 14px;
  font-weight: 600;
  color: white;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: color 0.2s ease;
  flex-shrink: 0;
  pointer-events: auto;
}

.song-artist:hover {
  color: rgba(255, 255, 255, 1);
}

.song-info-row {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 1;
  min-width: 0;
}

.separator {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 4px;
  flex-shrink: 0;
}

.song-album {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: color 0.2s ease;
  flex-shrink: 0;
  pointer-events: auto;
}

.song-album:hover {
  color: rgba(255, 255, 255, 1);
}

.progress-section-mini {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 15px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.time-display-mini {
  display: flex;
  justify-content: center;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  min-width: 50px;
  flex-shrink: 0;
}

.progress-bar-mini {
  position: relative;
  height: 3px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  cursor: pointer;
  transition: height 0.2s ease;
  flex: 1;
}

.progress-bar-mini:hover {
  height: 5px;
}

.progress-bg-mini {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 2px;
}

.progress-fill-mini {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: white;
  border-radius: 2px;
  transition: width 0.1s linear;
}

.progress-handle-mini {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: left 0.1s linear;
  opacity: 0;
}

.progress-bar-mini:hover .progress-handle-mini {
  opacity: 1;
}

.progress-section {
  flex: 1;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.time-display {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}

.progress-bar {
  position: relative;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  cursor: pointer;
}

.progress-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 2px;
}

.progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: white;
  border-radius: 2px;
  transition: width 0.1s linear;
}

.progress-handle {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: left 0.1s linear;
}

.controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.control-btn.play-btn {
  width: 44px;
  height: 44px;
  background: white;
  color: #667eea;
}

.control-btn.play-btn:hover {
  background: rgba(255, 255, 255, 0.9);
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
  color: white;
}

.volume-control i {
  font-size: 14px;
}

.volume-control input {
  width: 60px;
  height: 4px;
  -webkit-appearance: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
}

.volume-control input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
}

audio {
  display: none;
}

.fullscreen-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(102, 126, 234, 1) 0%, rgba(118, 75, 162, 1) 100%);
  z-index: 9999 !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-container.playlist-view {
  bottom: 0;
}

.fullscreen-container.lyrics-view {
  bottom: 0;
}

.fullscreen-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
  position: relative;
}

.fullscreen-content > .song-info-top,
.fullscreen-content > .custom-dropdown {
  margin-bottom: 20px;
}

.fullscreen-content > .clear-playlist-btn-full,
.fullscreen-content > .close-btn {
  position: absolute;
  top: 20px;
}

.fullscreen-content > .clear-playlist-btn-full {
  right: 70px;
}

.fullscreen-content > .close-btn {
  right: 20px;
}

.fullscreen-content.playlist-view > .close-btn {
  top: 20px;
}

.fullscreen-content.playlist-view > .clear-playlist-btn-full {
  top: 20px;
}

.song-info-top {
  display: flex;
  align-items: center;
  gap: 20px;
}

.song-cover-full {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.song-cover-full img,
.song-cover-full .cover-placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.song-cover-full .cover-placeholder i {
  font-size: 24px;
  color: rgba(255, 255, 255, 0.5);
}

.song-meta-full {
  flex: 1;
  min-width: 0;
}

.song-meta-full h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: white;
}

.artist-album {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artist-album span {
  cursor: pointer;
  transition: color 0.2s ease;
}

.artist-album span:hover {
  color: rgba(255, 255, 255, 1);
}

.album-separator {
  margin: 0 6px;
  color: rgba(255, 255, 255, 0.5);
  cursor: default;
}

.playlist-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: white;
}

.fullscreen-footer,
.playlist-footer {
  padding: 20px;
  box-sizing: border-box;
}

.fullscreen-footer .progress-section,
.playlist-footer .progress-section {
  margin-bottom: 20px;
}

.fullscreen-footer .controls,
.playlist-footer .controls {
  justify-content: center;
}

.lyrics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  color: white;
  width: 100%;
  padding: 0 20px;
  box-sizing: border-box;
}

.song-info-top {
  display: flex;
  align-items: center;
  gap: 20px;
}

.song-cover-full {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.song-cover-full img,
.song-cover-full .cover-placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.song-cover-full .cover-placeholder i {
  font-size: 32px;
  color: rgba(255, 255, 255, 0.5);
}

.song-meta-full {
  flex: 1;
  min-width: 0;
}

.song-meta-full h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artist-album {
  font-size: 16px;
  opacity: 0.9;
}

.close-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  z-index: 3000 !important;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.lyrics-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  scroll-behavior: smooth;
  margin-bottom: 20px;
}

.lyrics-content::before {
  content: '';
  flex: 1;
}

.lyrics-content::after {
  content: '';
  flex: 1;
}

.lyrics-content::-webkit-scrollbar {
  width: 0;
}

.lyric-line {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.7);
  margin: 12px 0;
  padding: 0 20px;
  text-align: center;
  transition: all 0.3s ease;
  line-height: 1.5;
}

.lyric-line.active {
  font-size: 22px;
  color: white;
  font-weight: 500;
  transform: scale(1.05);
}

.no-lyrics {
  color: rgba(255, 255, 255, 0.5);
  font-size: 18px;
}

.extra-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 20px;
}

.play-mode-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.play-mode-icon.single-loop {
  position: relative;
}

.loop-number {
  position: absolute;
  bottom: -2px;
  right: -2px;
  font-size: 8px;
  font-weight: bold;
  color: white;
  background: #667eea;
  border-radius: 50%;
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%);
  backdrop-filter: blur(20px);
  z-index: 200;
  display: flex;
  flex-direction: column;
}

.playlist-view .playlist-content-full {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 150px;
}

.playlist-header-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 20px;
}

.current-playlist-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.playlist-selector-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.playlist-selector-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
}

.playlist-selector-content {
  background: white;
  border-radius: 16px;
  padding: 20px;
  min-width: 320px;
  max-width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  z-index: 10001;
}

.playlist-selector-content h3 {
  margin: 0 0 20px 0;
  color: #333;
  font-size: 18px;
}

.playlist-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 50vh;
  overflow-y: auto;
}

.playlist-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #f5f5f5;
  color: #333;
}

.playlist-item:hover {
  background: #e8e8e8;
}

.playlist-item.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.playlist-item-name {
  font-size: 14px;
  font-weight: 500;
}

.playlist-item-count {
  font-size: 12px;
  color: #999;
}

.playlist-item.active .playlist-item-count {
  color: rgba(255, 255, 255, 0.8);
}

.close-btn-modal {
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

.close-btn-modal:hover {
  opacity: 0.9;
  transform: translateY(-2px);
}

.playlist-header-full {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  color: white;
  width: 100%;
  padding: 0 20px;
  box-sizing: border-box;
}

.playlist-source-selector {
  display: flex;
  gap: 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 4px;
}

.source-tab {
  flex: 1;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
}

.source-tab:hover {
  background: rgba(255, 255, 255, 0.15);
}

.source-tab.active {
  background: rgba(255, 255, 255, 0.25);
  color: white;
  font-weight: 600;
}

.playlist-dropdown:hover {
  background: rgba(255, 255, 255, 0.15);
}

.playlist-dropdown option {
  background: #333;
  color: white;
}

.custom-dropdown {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  position: relative;
}

.dropdown-trigger {
  width: 200px;
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 14px;
  cursor: pointer;
  outline: none;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dropdown-trigger:hover {
  background: rgba(255, 255, 255, 0.15);
}

.dropdown-text {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-arrow {
  margin-left: 10px;
  transition: transform 0.3s ease;
}

.dropdown-arrow.rotated {
  transform: rotate(180deg);
}

.dropdown-options {
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  z-index: 1000;
  max-height: 300px;
  overflow-y: auto;
}

.dropdown-option {
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  color: #333;
}

.dropdown-option:last-child {
  border-bottom: none;
}

.dropdown-option:hover {
  background: rgba(102, 126, 234, 0.1);
}

.dropdown-option.active {
  background: rgba(102, 126, 234, 0.2);
  color: #667eea;
  font-weight: 500;
}

.dropdown-option span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.play-playlist-btn {
  height: 36px;
  padding: 0 20px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.3s;
  margin-top: 5px;
  font-size: 14px;
}

.play-playlist-btn:hover {
  background: white;
  color: #667eea;
  transform: scale(1.1);
}

.playlist-header-full h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.playlist-content-full {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 20px;
}

.playlist-content-full::-webkit-scrollbar {
  width: 0;
}

.empty-playlist-full {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.6);
}

.empty-playlist-full i {
  font-size: 64px;
  margin-bottom: 20px;
}

.empty-playlist-full p {
  margin: 5px 0;
  font-size: 16px;
}

.playlist-list-full {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.playlist-item-full {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.3s ease;
  margin-bottom: 0;
}

.playlist-item-full:hover {
  background-color: rgba(255, 255, 255, 0.1);
  transform: translateX(5px);
}

.playlist-item-full.active {
  background-color: rgba(102, 126, 234, 0.2);
}

.playlist-item-index-full {
  font-weight: bold;
  margin-right: 10px;
  width: 30px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 20px;
  color: rgba(255, 255, 255, 0.8);
}

.playlist-item-index-full.current {
  color: white;
}

.playlist-item-title-container-full {
  flex: 2;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.playlist-item-title-full {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: white;
  font-size: 14px;
}

.playlist-item-artist-full {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 10px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
}

.playlist-item-timelen-full {
  width: 150px;
  text-align: right;
  color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  font-size: 13px;
}

.track-actions {
  display: flex;
  align-items: center;
  gap: 5px;
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

.queue-play-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: white;
}

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

.playlist-footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 20px;
}

.playlist-header-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 20px;
}

.clear-playlist-btn-full {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border-radius: 50%;
  background: rgba(255, 100, 100, 0.3);
  border: none;
  color: white;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
  width: 36px;
  height: 36px;
}

.clear-playlist-btn-full:hover {
  background: rgba(255, 100, 100, 0.5);
}

@media (max-width: 768px) {
  .player-content {
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 15px;
  }

  .song-info {
    flex: 1;
  }

  .song-cover {
    width: 45px;
    height: 45px;
  }

  .progress-section {
    order: 3;
    flex: 1;
    min-width: 100%;
  }

  .controls {
    order: 2;
  }

  .volume-control {
    display: none;
  }

  .view-switch-btn {
    padding: 6px 12px;
    font-size: 12px;
  }

  .view-switch-btn i {
    font-size: 12px;
  }

  .fullscreen-footer,
  .playlist-footer {
    padding: 15px;
  }

  .lyric-line {
    font-size: 16px;
    margin: 10px 0;
  }

  .lyric-line.active {
    font-size: 18px;
  }
}

@media (max-width: 480px) {
  .player-content {
    padding: 10px 12px;
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

  .control-btn {
    width: 35px;
    height: 35px;
  }

  .control-btn.play-btn {
    width: 45px;
    height: 45px;
  }
}

/* 确认弹窗样式 */
.confirm-dialog {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-dialog-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.confirm-dialog-content {
  position: relative;
  z-index: 1;
  width: 90%;
  max-width: 400px;
  background: rgba(102, 126, 234, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  color: white;
  overflow: hidden;
  animation: confirmDialogFadeIn 0.3s ease;
}

@keyframes confirmDialogFadeIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.confirm-dialog-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.confirm-dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: white;
}

.confirm-dialog-body {
  padding: 20px 24px;
}

.confirm-dialog-body p {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.9);
}

.confirm-dialog-footer {
  display: flex;
  gap: 12px;
  padding: 16px 24px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.confirm-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.confirm-btn.cancel {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.confirm-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.3);
}

.confirm-btn.confirm {
  background: rgba(255, 100, 100, 0.7);
  color: white;
}

.confirm-btn.confirm:hover {
  background: rgba(255, 100, 100, 0.9);
}

@media (max-width: 480px) {
  .confirm-dialog-content {
    width: 90%;
    max-width: 300px;
  }
  
  .confirm-dialog-header {
    padding: 16px 20px 12px;
  }
  
  .confirm-dialog-header h3 {
    font-size: 16px;
  }
  
  .confirm-dialog-body {
    padding: 16px 20px;
  }
  
  .confirm-dialog-body p {
    font-size: 14px;
  }
  
  .confirm-dialog-footer {
    padding: 12px 20px 16px;
  }
  
  .confirm-btn {
    padding: 8px 14px;
    font-size: 13px;
  }
}
</style>
