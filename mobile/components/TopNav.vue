<template>
  <div class="top-nav">
    <div class="nav-container">
      <button 
        class="nav-item" 
        :class="{ active: isActive('/home') }"
        @click="navigateTo('/home')"
      >
        <i class="fas fa-home"></i>
        <span>首页</span>
      </button>
      <button 
        class="nav-item" 
        :class="{ active: isActive('/ranking') }"
        @click="navigateTo('/ranking')"
      >
        <i class="fas fa-chart-line"></i>
        <span>排行榜</span>
      </button>
      <button 
        class="nav-item" 
        :class="{ active: isActive('/search') }"
        @click="navigateTo('/search')"
      >
        <i class="fas fa-search"></i>
        <span>搜索</span>
      </button>
      <button 
        class="nav-item" 
        :class="{ active: isActive('/profile') }"
        @click="navigateTo('/profile')"
      >
        <i class="fas fa-user"></i>
        <span>我的</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const isActive = (path) => {
  // 对于歌单详情页，不激活任何导航项
  if (route.path === '/playlistDetail') {
    return false
  }
  // 对于其他页面，精确匹配路径
  return route.path === path
}

const navigateTo = (path) => {
  router.push(path)
}
</script>

<style scoped>
.top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: rgba(102, 126, 234, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
}

.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: center;
  gap: 40px;
  padding: 12px 20px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: transparent;
  border: none;
  border-radius: 25px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.nav-item i {
  font-size: 18px;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  transform: translateY(-2px);
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.3);
  color: white;
  font-weight: 600;
}

.nav-item.active:hover {
  background: rgba(255, 255, 255, 0.4);
}

@media (max-width: 768px) {
  .nav-container {
    gap: 20px;
    padding: 10px 15px;
  }

  .nav-item {
    padding: 8px 16px;
    font-size: 14px;
  }

  .nav-item i {
    font-size: 16px;
  }
}

@media (max-width: 480px) {
  .nav-container {
    gap: 10px;
    padding: 8px 10px;
  }

  .nav-item {
    padding: 6px 12px;
    font-size: 13px;
  }

  .nav-item i {
    font-size: 14px;
  }
}
</style>
