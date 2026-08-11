<template>
  <teleport to="body">
    <transition name="modal-fade">
          <div v-if="show" class="vip-modal-overlay" @click="handleClose">
        <div class="vip-modal-content" @click.stop>
          <div class="vip-modal-header">
            <div class="header-title">
              <i class="fas fa-crown"></i>
              <span>VIP信息</span>
            </div>
            <button class="close-btn" @click="handleClose">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="vip-modal-body">
            <div class="vip-info-section">
              <div v-if="vipList.length > 0" class="vip-busi-list">
                <div v-for="(vip, index) in vipList" :key="index" class="vip-item">
                  <div class="vip-label">{{ vip.type }}</div>
                  <div class="vip-value">
                    {{ formatTime(vip.expireTime) }}
                  </div>
                </div>
              </div>

              <div v-else class="vip-empty">
                <i class="fas fa-info-circle"></i>
                <span>暂无有效VIP</span>
              </div>
            </div>

            <div class="vip-actions-section">
              <button
                class="vip-action-btn claim-btn"
                :disabled="claiming"
                @click="handleClaimHourVip"
              >
                <i class="fas fa-gift"></i>
                <span>{{ claiming ? '领取中...' : '领取3小时VIP' }}</span>
              </button>

              <button
                class="vip-action-btn day-btn"
                :disabled="claimingDay"
                @click="handleClaimDayVip"
              >
                <i class="fas fa-calendar-day"></i>
                <span>{{ claimingDay ? '领取中...' : '领取1天VIP' }}</span>
              </button>

              <button
                v-if="hasVip"
                class="vip-action-btn upgrade-btn"
                :disabled="upgrading"
                @click="handleUpgradeVip"
              >
                <i class="fas fa-arrow-up"></i>
                <span>{{ upgrading ? '升级中...' : '升级概念版VIP' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
const DEV = import.meta.env.DEV
import { MoeAuthStore } from '../stores/store'
import message from '../utils/message'

const props = defineProps({
  show: { type: Boolean, default: false },
  vipData: { type: Object, default: null }
})

const emit = defineEmits(['close', 'refresh'])
const MoeAuth = MoeAuthStore()

const claiming = ref(false)
const claimingDay = ref(false)
const upgrading = ref(false)

const hasVip = computed(() => MoeAuth.isVip)
const vipList = computed(() => MoeAuth.vipDisplayList)

const formatTime = (expireTime) => {
  if (!expireTime) return '未开通'
  const d = new Date(expireTime)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const handleClose = () => emit('close')

const handleClaimHourVip = async () => {
  try {
    claiming.value = true
    const res = await MoeAuth.claimHourVip()
    if (res.status === 1) {
      message.success(`签到成功，获得${res.data.award_vip_hour}小时VIP`)
      emit('refresh')
    } else {
      message.error(res.data || '领取失败')
    }
  } catch (error) {
    const errBody = error.response?.data
    const errCode = errBody?.error_code || errBody?.errcode
    if (errCode === 131001 || errCode === 297002) {
      message.success(errBody?.error_msg || '今天已经签到过了')
    } else {
      message.error(errBody?.data || errBody?.msg || '领取失败，请稍后重试')
    }
  } finally {
    claiming.value = false
  }
}

const handleClaimDayVip = async () => {
  try {
    claimingDay.value = true
    const todayKey = new Date().toISOString().split('T')[0]
    const res = await MoeAuth.claimDayVip(todayKey)
    if (res.status === 1) {
      message.success('领取成功！获得1天VIP')
      emit('refresh')
    } else {
      message.error(res.data || '领取失败')
    }
  } catch (error) {
    const errBody = error.response?.data
    const errCode = errBody?.error_code
    if (errCode === 131001 || errCode === 297002) {
      message.success(errBody?.error_msg || '今天已经签到过了')
    } else {
      message.error(errBody?.data || errBody?.msg || '领取失败，请稍后重试')
    }
  } finally {
    claimingDay.value = false
  }
}

const handleUpgradeVip = async () => {
  try {
    upgrading.value = true
    const res = await MoeAuth.upgradeDayVip()
    if (res.status === 1) {
      message.success('升级成功！获得1天概念版VIP')
      emit('refresh')
    } else {
      message.error(res.data || '升级失败')
    }
  } catch (error) {
    const errBody = error.response?.data
    const errCode = errBody?.error_code
    if (errCode === 131001 || errCode === 297002) {
      message.success(errBody?.error_msg || '今天已经签到过了')
    } else {
      message.error(errBody?.data || errBody?.msg || '升级失败，请稍后重试')
    }
  } finally {
    upgrading.value = false
  }
}
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

.vip-modal-overlay {
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

.vip-modal-content {
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  animation: modalSlideIn 0.3s ease-out;
  width: 90%;
  max-width: 400px;
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

.vip-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 16px 16px 0 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
}

.header-title i {
  font-size: 20px;
}

.close-btn {
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

.vip-modal-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.vip-info-section {
  margin-bottom: 20px;
}

.vip-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 10px;
}

.vip-label {
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.vip-value {
  font-size: 14px;
  color: #333;
  font-weight: 600;
}

.vip-busi-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vip-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  color: #999;
  font-size: 14px;
}

.vip-actions-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vip-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  color: white;
}

.vip-action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.vip-action-btn i {
  font-size: 16px;
}

.claim-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.claim-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.day-btn {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.day-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 87, 108, 0.3);
}

.upgrade-btn {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.upgrade-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 242, 254, 0.3);
}

@media (max-width: 480px) {
  .vip-modal-content {
    max-width: 350px;
  }

  .vip-modal-header {
    padding: 14px 16px;
  }

  .vip-modal-body {
    padding: 16px;
  }

  .vip-item {
    padding: 10px 14px;
  }
}
</style>
