<template>
  <div id="app">
    <TopNav />
    <div class="content-wrapper" :style="{ paddingBottom: paddingBottom + 'px' }">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </div>
    <MusicPlayer ref="musicPlayer" />
    <FloatingTaskWidget />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import TopNav from './components/TopNav.vue'
import MusicPlayer from './components/MusicPlayer.vue'
import FloatingTaskWidget from './components/FloatingTaskWidget.vue'
import { MoeAuthStore } from './stores/store'

const musicPlayer = ref(null)
const paddingBottom = ref(0)

const checkPlayerStatus = () => {
  if (musicPlayer.value && musicPlayer.value.hasCurrentSong.value) {
    paddingBottom.value = musicPlayer.value.hasCurrentSong.value ? 80 : 0
  }
}

watch(() => musicPlayer.value?.hasCurrentSong, (newValue) => {
  if (newValue !== undefined) {
    paddingBottom.value = newValue ? 80 : 0
  }
}, { immediate: true })

// 全局 token 预刷新定时器：每 15 分钟主动 refresh 一次 token
// 覆盖"用户长时间挂机后操作导致 token 过期"的场景
// 避免在页面可见性变化或用户恢复操作时才发现 token 过期（那时 refresh 可能已经来不及）
const TOKEN_REFRESH_INTERVAL_MS = 15 * 60 * 1000  // 15 分钟
let tokenRefreshTimer = null

const startTokenRefreshTimer = () => {
  if (tokenRefreshTimer) clearInterval(tokenRefreshTimer)
  tokenRefreshTimer = setInterval(async () => {
    const MoeAuth = MoeAuthStore()
    if (MoeAuth.UserInfo?.token && MoeAuth.UserInfo?.userid) {
      try {
        console.log('[TokenRefresh] 定时预刷新 token')
        await MoeAuth.refreshToken()
      } catch (e) {
        console.warn('[TokenRefresh] 预刷新失败:', e?.message)
      }
    }
  }, TOKEN_REFRESH_INTERVAL_MS)
}

onMounted(async () => {
  const MoeAuth = MoeAuthStore()
  await MoeAuth.initDevice()

  if (MoeAuth.UserInfo?.token) {
    const valid = await MoeAuth.validateToken()
    if (!valid) {
      const refreshed = await MoeAuth.refreshToken()
      if (!refreshed) {
        MoeAuth.clearUserData()
      }
    }
    // 启动定时预刷新（仅登录用户）
    startTokenRefreshTimer()
  }

  setTimeout(checkPlayerStatus, 100)
})

onUnmounted(() => {
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer)
    tokenRefreshTimer = null
  }
})
</script>

<style scoped>
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.content-wrapper {
  flex: 1;
  padding-top: 60px;
  transition: padding-bottom 0.3s ease;
}
</style>
