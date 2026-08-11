<template>
  <div class="artist-grid">
    <div v-for="(artist, index) in artists" :key="index" class="artist-card" @click="onArtistClick(artist)">
      <div class="artist-cover">
        <img v-if="artist.Avatar" :src="artist.Avatar.replace('/240/','/480/')"/>
        <div v-else class="artist-avatar-placeholder">
          <i class="fas fa-user"></i>
        </div>
        <div class="artist-overlay">
          <button class="play-button">
            <i class="fas fa-play"></i>
          </button>
        </div>
      </div>
      <div class="artist-info">
        <h3 class="artist-name" :title="artist.AuthorName">{{ artist.AuthorName }}</h3>
        <div class="artist-meta">
          <div class="meta-item">
            <i class="fas fa-music"></i>
            <span>单曲: {{ artist.AudioCount }}</span>
          </div>
          <div class="meta-item">
            <i class="fas fa-compact-disc"></i>
            <span>专辑: {{ artist.AlbumCount }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  artists: {
    type: Array,
    required: true,
    default: () => []
  }
});

const emit = defineEmits(['artist-click']);

const onArtistClick = (artist) => {
  emit('artist-click', artist);
};
</script>

<style scoped>
.artist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.artist-card {
  display: flex;
  flex-direction: column;
  background-color: #fff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition: transform 0.3s, box-shadow 0.3s;
  cursor: pointer;
  height: 100%;
}

.artist-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
}

.artist-cover {
  position: relative;
  width: 100%;
  padding-top: 100%;
  overflow: hidden;
}

.artist-avatar-placeholder {
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

.artist-avatar-placeholder i {
  font-size: 60px;
  color: white;
}

.artist-cover img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s;
}

.artist-card:hover .artist-cover img {
  transform: scale(1.05);
}

.artist-overlay {
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

.artist-card:hover .artist-overlay {
  opacity: 1;
}

.play-button {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background-color: var(--primary-color);
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
  background-color: var(--primary-color-dark, #d81e06);
}

.play-button i {
  font-size: 20px;
}

.artist-info {
  padding: 10px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.artist-name {
  font-size: 14px;
  font-weight: bold;
  margin: 0 0 4px 0;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artist-meta {
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
  color: var(--primary-color);
}

@media (max-width: 768px) {
  .artist-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 15px;
  }

  .artist-name {
    font-size: 14px;
  }

  .meta-item {
    font-size: 10px;
    padding: 3px 6px;
  }
}
</style>