<template>
  <teleport to="body">
    <transition name="modal-fade">
      <div v-if="show" class="quality-modal-overlay" @click="handleOverlayClick">
        <div class="quality-modal-content" :class="sizeClass" @click.stop>
          <div v-if="showHeader" class="quality-modal-header" :class="headerClass">
            <div class="header-left">
              <div v-if="showCover" class="cover-wrapper">
                <img 
                  v-if="displayCover" 
                  :src="displayCover" 
                  :alt="songName"
                  class="cover-image"
                  @error="handleCoverError"
                />
                <div v-else class="cover-placeholder">
                  <i :class="coverIcon"></i>
                </div>
              </div>
              <div class="song-info">
                <div v-if="songName" class="song-name" :title="songName">{{ songName }}</div>
                <div v-if="artistName" class="artist-name" :title="artistName">{{ artistName }}</div>
                <div v-if="extraInfo" class="extra-info">{{ extraInfo }}</div>
              </div>
            </div>
            <button v-if="showCloseButton" class="close-btn" @click="handleClose" :title="closeButtonText">
              <i :class="closeIcon"></i>
            </button>
          </div>
          
          <div class="quality-modal-body">
            <div v-if="title" class="section-title">{{ title }}</div>
            <div v-if="description" class="section-description">{{ description }}</div>
            
            <slot name="before-list"></slot>
            
            <div class="quality-list" :class="listClass">
              <button 
                v-for="(item, index) in displayQualities" 
                :key="getItemKey(item, index)"
                class="quality-item"
                :class="{ 
                  'quality-item-disabled': isItemDisabled(item),
                  'quality-item-selected': isItemSelected(item),
                  'quality-item-hoverable': !isItemDisabled(item)
                }"
                :disabled="isItemDisabled(item)"
                :title="getDisabledReason(item)"
                @click="handleItemClick(item)"
              >
                <div class="quality-left">
                  <slot name="item-left" :item="item" :index="index">
                    <div class="quality-name">{{ getItemName(item) }}</div>
                    <div class="quality-desc">{{ getItemDescription(item) }}</div>
                  </slot>
                </div>
                <div class="quality-right">
                  <slot name="item-right" :item="item" :index="index">
                    <div v-if="showItemSize && item.size" class="quality-size">{{ item.size }}</div>
                    <i v-if="showItemIcon && !isItemDisabled(item)" :class="itemIcon"></i>
                    <span 
                      v-if="isItemDisabled(item) && props.guestMode && getItemQuality(item) !== '128'" 
                      class="login-hint"
                      @click.stop="goToLogin"
                    >请先登录</span>
                  </slot>
                </div>
              </button>
            </div>
            
            <slot name="after-list"></slot>
          </div>
          
          <div v-if="$slots.footer || showFooter" class="quality-modal-footer">
            <slot name="footer">
              <button v-if="showCancelButton" class="footer-btn cancel-btn" @click="handleCancel">
                {{ cancelButtonText }}
              </button>
            </slot>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  song: {
    type: Object,
    default: null
  },
  qualities: {
    type: Array,
    default: () => []
  },
  title: {
    type: String,
    default: '选择下载音质'
  },
  description: {
    type: String,
    default: ''
  },
  cover: {
    type: String,
    default: ''
  },
  showHeader: {
    type: Boolean,
    default: true
  },
  showCover: {
    type: Boolean,
    default: true
  },
  showCloseButton: {
    type: Boolean,
    default: true
  },
  showFooter: {
    type: Boolean,
    default: false
  },
  showCancelButton: {
    type: Boolean,
    default: false
  },
  showItemIcon: {
    type: Boolean,
    default: true
  },
  showItemSize: {
    type: Boolean,
    default: false
  },
  closeOnOverlay: {
    type: Boolean,
    default: true
  },
  closeOnEsc: {
    type: Boolean,
    default: true
  },
  size: {
    type: String,
    default: 'medium',
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  },
  headerClass: {
    type: String,
    default: ''
  },
  listClass: {
    type: String,
    default: ''
  },
  closeButtonText: {
    type: String,
    default: '关闭'
  },
  cancelButtonText: {
    type: String,
    default: '取消'
  },
  coverIcon: {
    type: String,
    default: 'fas fa-music'
  },
  closeIcon: {
    type: String,
    default: 'fas fa-times'
  },
  itemIcon: {
    type: String,
    default: 'fas fa-download'
  },
  itemKeyField: {
    type: String,
    default: 'quality'
  },
  itemNameField: {
    type: String,
    default: 'name'
  },
  itemDescField: {
    type: String,
    default: 'quality'
  },
  disabledItems: {
    type: Array,
    default: () => []
  },
  selectedItem: {
    type: [Object, String, Number],
    default: null
  },
  songNameField: {
    type: [String, Array],
    default: () => ['name', 'ori_audio_name', 'songname', 'audio_name']
  },
  artistNameField: {
    type: [String, Array],
    default: () => ['author', 'author_name', 'singer_name', 'singername']
  },
  extraInfo: {
    type: String,
    default: ''
  },
  guestMode: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'close',
  'cancel',
  'select',
  'item-click',
  'quality-select'
])

const coverError = ref(false)

const sizeClass = computed(() => `quality-modal-${props.size}`)

const songName = computed(() => {
  if (!props.song) return ''
  
  const fields = Array.isArray(props.songNameField) 
    ? props.songNameField 
    : [props.songNameField]
  
  for (const field of fields) {
    if (props.song[field]) {
      return props.song[field]
    }
  }
  
  return ''
})

const artistName = computed(() => {
  if (!props.song) return ''
  
  const fields = Array.isArray(props.artistNameField) 
    ? props.artistNameField 
    : [props.artistNameField]
  
  for (const field of fields) {
    if (props.song[field]) {
      return props.song[field]
    }
  }
  
  return ''
})

const displayCover = computed(() => {
  if (coverError.value) return null
  
  if (props.cover) return props.cover
  
  if (!props.song) return null
  
  const coverFields = [
    'sizable_cover',
    'img',
    'union_cover',
    'cover',
    'album_cover',
    'pic'
  ]
  
  for (const field of coverFields) {
    if (props.song[field]) {
      let cover = props.song[field]
      if (typeof cover === 'string') {
        cover = cover.replace('{size}', '160').replace(/[`]/g, '').trim()
        return cover
      }
    }
  }
  
  return null
})

const displayQualities = computed(() => {
  if (!props.qualities || props.qualities.length === 0) {
    return [
      { name: '无损音质 FLAC', quality: 'flac' },
      { name: '高品质', quality: '320' },
      { name: '标准音质', quality: '128' }
    ]
  }
  return props.qualities
})

const getItemKey = (item, index) => {
  if (props.itemKeyField && item[props.itemKeyField] !== undefined) {
    return item[props.itemKeyField]
  }
  return index
}

const getItemName = (item) => {
  if (props.itemNameField && item[props.itemNameField] !== undefined) {
    return item[props.itemNameField]
  }
  return item.name || item.quality || ''
}

const getItemDescription = (item) => {
  if (props.itemDescField && item[props.itemDescField] !== undefined) {
    const desc = item[props.itemDescField]
    if (desc === 'flac') return '无损 FLAC'
    if (typeof desc === 'number' || (typeof desc === 'string' && !isNaN(desc))) return `${desc}K MP3`
    return desc
  }
  return item.description || ''
}

const isItemDisabled = (item) => {
  const key = getItemKey(item)
  if (props.disabledItems.includes(key) || props.disabledItems.includes(item)) {
    return true
  }
  if (props.guestMode) {
    const quality = item.quality || key
    if (quality !== '128') {
      return true
    }
  }
  return false
}

const getItemQuality = (item) => {
  return item.quality || getItemKey(item)
}

const getDisabledReason = (item) => {
  if (!isItemDisabled(item)) return ''
  if (props.guestMode && getItemQuality(item) !== '128') {
    return '请先登录后下载高品质音乐'
  }
  return '此音质暂不可用'
}

const isItemSelected = (item) => {
  if (!props.selectedItem) return false
  
  const key = getItemKey(item)
  return key === props.selectedItem || item === props.selectedItem
}

const handleCoverError = () => {
  coverError.value = true
}

const handleOverlayClick = () => {
  if (props.closeOnOverlay) {
    handleClose()
  }
}

const handleClose = () => {
  emit('close')
}

const handleCancel = () => {
  emit('cancel')
  handleClose()
}

const handleItemClick = (item) => {
  if (isItemDisabled(item)) return
  
  handleClose()
  
  emit('select', item)
  emit('quality-select', item)
}

const goToLogin = () => {
  handleClose()
  router.push('/login')
}

const handleEsc = (event) => {
  if (props.closeOnEsc && event.key === 'Escape' && props.show) {
    handleClose()
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleEsc)
}

defineExpose({
  handleClose,
  handleCancel,
  handleItemClick
})
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.quality-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
  padding: 20px;
}

.quality-modal-content {
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  animation: modalSlideIn 0.3s ease-out;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.quality-modal-small {
  max-width: 320px;
  width: 90%;
}

.quality-modal-medium {
  max-width: 400px;
  width: 90%;
}

.quality-modal-large {
  max-width: 500px;
  width: 95%;
}

.quality-modal-header {
  display: flex;
  align-items: center;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  position: relative;
  border-radius: 16px 16px 0 0;
}

.header-left {
  display: flex;
  align-items: center;
  flex: 1;
  overflow: hidden;
}

.cover-wrapper {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: rgba(255, 255, 255, 0.8);
}

.song-info {
  flex: 1;
  margin-left: 12px;
  overflow: hidden;
}

.song-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artist-name {
  font-size: 13px;
  opacity: 0.9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.extra-info {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  font-size: 14px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: rotate(90deg);
}

.quality-modal-body {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  background: #f8f9fa;
  border-radius: 0 0 16px 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
  text-align: center;
}

.section-description {
  font-size: 13px;
  color: #666;
  margin-bottom: 12px;
  text-align: center;
  line-height: 1.5;
}

.quality-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quality-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  width: 100%;
  text-align: left;
}

.quality-item-hoverable:hover {
  transform: translateX(6px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.2);
  background: #f0f4ff;
}

.quality-item-selected {
  border: 2px solid #667eea;
  background: #f0f4ff;
}

.quality-item-disabled {
  opacity: 0.7;
  cursor: not-allowed;
  background: #fafafa;
}

.quality-item-disabled:hover {
  transform: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  background: #fafafa;
}

.login-hint {
  font-size: 13px;
  color: #667eea;
  background: rgba(102, 126, 234, 0.1);
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.login-hint:hover {
  background: rgba(102, 126, 234, 0.2);
  color: #5a6fd6;
}

.quality-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  flex: 1;
  overflow: hidden;
}

.quality-name {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.quality-desc {
  font-size: 12px;
  color: #888;
}

.quality-right {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
}

.quality-size {
  font-size: 12px;
  color: #666;
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 4px;
}

.quality-right > i {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 16px;
  transition: all 0.3s;
}

.quality-item-hoverable:hover .quality-right > i {
  transform: scale(1.1);
}

.quality-modal-footer {
  padding: 12px 16px;
  background: white;
  border-top: 1px solid #eee;
  border-radius: 0 0 16px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.footer-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.cancel-btn {
  background: #f5f5f5;
  color: #666;
}

.cancel-btn:hover {
  background: #e0e0e0;
}

@media (max-width: 480px) {
  .quality-modal-small {
    max-width: 300px;
  }
  
  .quality-modal-medium {
    max-width: 350px;
  }
  
  .quality-modal-large {
    max-width: 400px;
  }
  
  .quality-modal-header {
    padding: 12px;
  }
  
  .cover-wrapper {
    width: 50px;
    height: 50px;
  }
  
  .song-name {
    font-size: 14px;
  }
  
  .artist-name {
    font-size: 12px;
  }
  
  .quality-modal-body {
    padding: 12px;
  }
  
  .quality-item {
    padding: 12px 14px;
  }
  
  .quality-name {
    font-size: 14px;
  }
}
</style>
