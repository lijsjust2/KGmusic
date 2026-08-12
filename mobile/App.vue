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
const TOKEN_REFRESH_INTERVAL_MS = 15 * 60 * 1000  // 15 分钟
const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000  // 切回前台时距上次刷新超过 10 分钟则补偿刷新
let tokenRefreshTimer = null
let lastTokenRefreshTime = Date.now()

const startTokenRefreshTimer = () => {
  if (tokenRefreshTimer) clearInterval(tokenRefreshTimer)
  tokenRefreshTimer = setInterval(async () => {
    const MoeAuth = MoeAuthStore()
    if (MoeAuth.UserInfo?.token && MoeAuth.UserInfo?.userid) {
      try {
        console.log('[TokenRefresh] 定时预刷新 token')
        await MoeAuth.refreshToken()
        lastTokenRefreshTime = Date.now()
      } catch (e) {
        // 网络错误不退出登录，等下次定时器再试
        console.warn('[TokenRefresh] 预刷新失败（网络错误），保留登录状态:', e?.message)
      }
    }
  }, TOKEN_REFRESH_INTERVAL_MS)
}

// visibilitychange：切回前台时补偿刷新 token
// 解决手机飞牛后台 setInterval 被系统节流导致 token 过期未刷新的问题
const handleVisibilityChange = async () => {
  if (document.hidden) return
  const MoeAuth = MoeAuthStore()
  if (!MoeAuth.UserInfo?.token || !MoeAuth.UserInfo?.userid) return
  const elapsed = Date.now() - lastTokenRefreshTime
  if (elapsed >= TOKEN_REFRESH_THRESHOLD_MS) {
    try {
      console.log('[TokenRefresh] 切回前台，补偿刷新 token')
      await MoeAuth.refreshToken()
      lastTokenRefreshTime = Date.now()
    } catch (e) {
      console.warn('[TokenRefresh] 补偿刷新失败（网络错误），保留登录状态:', e?.message)
    }
  }
}

onMounted(async () => {
  const MoeAuth = MoeAuthStore()
  await MoeAuth.initDevice()

  // 后端集中管理登录态：先从后端拉取共享 token
  // 如果后端有 token（其它设备登录过），用它替换本地，实现多设备共享
  const serverAuth = await MoeAuth.fetchTokenFromServer()
  if (serverAuth?.userInfo?.token) {
    // 后端有 token，且与本地不同时更新本地
    if (MoeAuth.UserInfo?.token !== serverAuth.userInfo.token) {
      console.log('[App] 从后端同步共享 token')
      MoeAuth.UserInfo = serverAuth.userInfo
      if (serverAuth.device && !MoeAuth.Device) {
        MoeAuth.Device = serverAuth.device
      }
    }
  }

  if (MoeAuth.UserInfo?.token) {
    // 启动时校验 token：区分"网络错误"和"token 真的失效"
    // 网络错误时保留登录状态（避免飞牛 webview 重新加载+网络抖动导致误退出）
    let tokenValid = false
    let validateNetworkError = false
    try {
      tokenValid = await MoeAuth.validateToken()
    } catch (e) {
      validateNetworkError = true
      console.warn('[App] validateToken 网络错误，保留登录状态:', e?.message)
    }

    if (validateNetworkError) {
      // 网络错误：假定 token 仍有效，启动定时器等下次再校验
      lastTokenRefreshTime = Date.now()
    } else if (!tokenValid) {
      // token 失效，尝试 refresh
      try {
        const refreshed = await MoeAuth.refreshToken()
        if (refreshed) {
          lastTokenRefreshTime = Date.now()
        } else {
          // token 真的失效了，清除并跳转登录
          await MoeAuth.clearTokenOnServer()
          MoeAuth.clearUserData()
          window.location.hash = '#/login'
        }
      } catch (e) {
        // refresh 网络错误：保留登录状态，启动定时器等下次再试
        console.warn('[App] refreshToken 网络错误，保留登录状态:', e?.message)
        lastTokenRefreshTime = Date.now()
      }
    } else {
      // token 有效，同步到后端（确保后端有最新 token）
      MoeAuth.saveTokenToServer()
      lastTokenRefreshTime = Date.now()
    }
    // 启动定时预刷新（仅登录用户）
    startTokenRefreshTimer()
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  setTimeout(checkPlayerStatus, 100)
})

onUnmounted(() => {
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer)
    tokenRefreshTimer = null
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange)
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
