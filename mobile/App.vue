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
import { detectFnosClientMode } from './utils/fnos'

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

// 全局 token 预刷新定时器：浏览器直连模式每 15 分钟主动 refresh 一次
// 飞牛模式不需要前端刷新 token：后端中间层会在每次请求遇到 status==2 时自动 refresh 并同步共享存储
const TOKEN_REFRESH_INTERVAL_MS = 15 * 60 * 1000  // 15 分钟
const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000  // 切回前台时距上次刷新超过 10 分钟则补偿刷新
let tokenRefreshTimer = null
let lastTokenRefreshTime = Date.now()

const startTokenRefreshTimer = () => {
  // 飞牛模式：完全由后端中间层接管 token 生命周期，前端不启定时器，避免并发 refresh 竞态
  if (detectFnosClientMode()) {
    console.log('[TokenRefresh] 飞牛模式：跳过前端定时预刷新（由后端中间层统一处理）')
    return
  }
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
// 飞牛模式：改为重新同步后端 /auth/status，而不是前端自己调 refresh（避免旧 token 并发竞态）
const handleVisibilityChange = async () => {
  if (document.hidden) return
  const MoeAuth = MoeAuthStore()
  if (!MoeAuth.UserInfo?.token) return
  if (detectFnosClientMode()) {
    // 飞牛模式：从后端拉最新共享 token + device（后端批处理可能刚更新过）
    const serverAuth = await MoeAuth.fetchTokenFromServer()
    if (serverAuth?.userInfo?.token) {
      if (serverAuth.userInfo.token !== MoeAuth.UserInfo.token) {
        console.log('[TokenRefresh] 切回前台，同步后端刷新的共享 token')
        MoeAuth.UserInfo = serverAuth.userInfo
      }
      if (serverAuth.device) MoeAuth.Device = serverAuth.device
    }
    lastTokenRefreshTime = Date.now()
    return
  }
  // 浏览器直连：补偿性 refresh
  if (!MoeAuth.UserInfo?.userid) return
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

  // 后端集中管理登录态：先从后端拉取共享 token + device
  // 飞牛环境：token 和 device 必须一致，否则 dfid 不同会导致歌单/歌数返回不一致
  const serverAuth = await MoeAuth.fetchTokenFromServer()
  if (serverAuth?.userInfo?.token) {
    // 飞牛环境：device 直接用后端的覆盖，保证所有飞牛端 dfid/mid/guid 完全相同
    if (detectFnosClientMode() && serverAuth.device) {
      console.log('[App] 从后端同步共享 device（dfid等）')
      MoeAuth.Device = serverAuth.device
    }

    // token 不同时更新本地
    if (MoeAuth.UserInfo?.token !== serverAuth.userInfo.token) {
      console.log('[App] 从后端同步共享 token')
      MoeAuth.UserInfo = serverAuth.userInfo
      // 非飞牛环境或后端没 device 时才走兜底：本地无 device 时补一个
      if (serverAuth.device && !MoeAuth.Device) {
        MoeAuth.Device = serverAuth.device
      }
    }
  } else if (detectFnosClientMode() && serverAuth?.noSharedAuth && MoeAuth.UserInfo?.token) {
    // 飞牛模式边界场景：后端确认没有共享 token（非网络错误），但本地 localStorage 有（浏览器模式遗留）
    // 必须清掉，否则前端以为已登录，但后端中间件没 auth 注入，所有请求都会失败
    console.log('[App] 飞牛模式：后端无共享 token，清除本地遗留登录态')
    MoeAuth.clearUserData()
  }

  if (MoeAuth.UserInfo?.token) {
    if (detectFnosClientMode()) {
      // ============= 飞牛模式 =============
      // 核心原则：后端中间层是登录态唯一真相（SSOT），前端绝不自己判断 token 失效
      // 理由：后端批处理可能刚 refresh 过 token，前端本地的 token 是旧的
      //       如果前端用旧 token validate → 失败 → refresh → 再失败 → 误调 clearTokenOnServer()
      //       会把后端刚刷新好的新 token 删掉，导致所有飞牛端退出登录
      //
      // 飞牛模式动作：
      //   1. 不 validate（store.js validateToken 已直接返回 true）
      //   2. 不主动 refresh（后端中间层遇到 status==2 会自动 refresh）
      //   3. 绝不调用 clearTokenOnServer()（只在用户主动点退出登录时才调）
      //   4. 如果后端 /auth/status 返回有 token 就是登录的，没 token 就是未登录的
      lastTokenRefreshTime = Date.now()
      startTokenRefreshTimer()
    } else {
      // ============= 浏览器直连模式 =============
      // 启动时校验 token：区分"网络错误"和"token 真的失效"
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
            // token 真的失效了，清除本地 localStorage 并跳转登录
            // 注意：浏览器直连不调用 clearTokenOnServer()（它只会在飞牛环境操作，本来就是空）
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
