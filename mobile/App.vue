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
import { ref, onMounted, watch } from 'vue';
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
  }
  
  setTimeout(checkPlayerStatus, 100)
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
