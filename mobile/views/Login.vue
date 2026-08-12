<template>
  <div class="login-container">
    <div class="login-box">
      <div class="logo-section">
        <i class="fas fa-music"></i>
        <h1>KuGou 概念版</h1>
        <p>登陆后，请领取VIP</p>
      </div>

      <div class="login-tabs">
        <button 
          :class="{ active: loginType === 'phone' }" 
          @click="loginType = 'phone'"
        >
          <i class="fas fa-mobile-alt"></i>
          手机登录
        </button>
        <button 
          :class="{ active: loginType === 'qr' }" 
          @click="loginType = 'qr'"
        >
          <i class="fas fa-qrcode"></i>
          扫码登录
        </button>
      </div>

      <div class="login-content">
        <div v-if="showAccountSelection" class="account-selection">
          <p class="selection-tip">该手机绑定多个账号，请选择要登录的账号</p>
          <div class="account-list">
            <div 
              v-for="account in accountList" 
              :key="account.userid"
              class="account-item"
              @click="selectAccount(account)"
            >
              <div class="account-avatar">
                <img :src="account.pic || '/assets/images/profile.jpg'" :alt="account.nickname" />
              </div>
              <div class="account-info">
                <div class="account-name">{{ account.nickname || '未命名用户' }}</div>
                <div class="account-status">
                  <span v-if="account.p_grade" class="svip-badge">Lv {{ account.p_grade }}</span>
                  <span class="user-level">UID：{{ account.userid }}</span>
                </div>
              </div>
              <div class="select-arrow">→</div>
            </div>
          </div>
          <button 
            type="button" 
            class="back-button" 
            @click="backToLogin"
          >
            返回登录
          </button>
        </div>

        <div v-else-if="loginType === 'phone'" class="phone-login">
          <div class="input-group" :class="{ 'has-error': phoneFormErrors.mobile }">
            <i class="fas fa-phone"></i>
            <input 
              v-model="phoneForm.mobile" 
              type="tel" 
              placeholder="请输入手机号"
              maxlength="11"
              @blur="validateField('mobile', phoneForm.mobile)"
            />
            <button 
              v-if="phoneForm.mobile" 
              class="clear-button" 
              @click="phoneForm.mobile = ''"
            >
              ×
            </button>
          </div>
          <div v-if="phoneFormErrors.mobile" class="error-text">
            {{ phoneFormErrors.mobile }}
          </div>
          
          <div class="input-group" :class="{ 'has-error': phoneFormErrors.code }">
            <i class="fas fa-shield-alt"></i>
            <input 
              v-model="phoneForm.code" 
              type="text" 
              placeholder="请输入验证码"
              maxlength="6"
              class="verification-input"
              @blur="validateField('code', phoneForm.code)"
            />
            <div class="spacer"></div>
            <button 
              v-if="phoneForm.code" 
              class="clear-button" 
              @click="phoneForm.code = ''"
            >
              ×
            </button>
            <button 
              class="send-code-btn" 
              :disabled="countdown > 0 || !phoneForm.mobile || isSendingCaptcha"
              @click="sendCode"
            >
              <span v-if="isSendingCaptcha" class="loading-spinner"></span>
              {{ countdown > 0 ? `${countdown}秒` : '发送验证码' }}
            </button>
          </div>
          <div v-if="phoneFormErrors.code" class="error-text">
            {{ phoneFormErrors.code }}
          </div>

          <button 
            class="login-btn" 
            :disabled="!phoneForm.mobile || !phoneForm.code || loading"
            @click="phoneLogin"
          >
            <span v-if="loading" class="loading-spinner"></span>
            {{ loading ? '登录中...' : '登录' }}
          </button>
        </div>

        <div v-else-if="loginType === 'qr'" class="qr-login">
          <div class="qr-container">
            <div v-if="qrCodeUrl" class="qr-code">
              <img :src="qrCodeUrl" alt="扫码登录" />
              <div v-if="qrStatus === 'expired'" class="qr-expired">
                <p>二维码已过期</p>
                <button @click="generateQRCode">刷新</button>
              </div>
              <div v-else-if="qrStatus === 'scanned'" class="qr-scanned">
                <p>已扫描，请在手机上确认</p>
              </div>
              <div v-else-if="qrStatus === 'confirmed'" class="qr-confirmed">
                <p>登录成功</p>
              </div>
            </div>
            <div v-else class="qr-loading">
              <div class="loading-spinner"></div>
              <p>生成二维码中...</p>
            </div>
          </div>
          <p class="qr-tip">请使用酷狗音乐APP扫码登录</p>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { get } from '../utils/request'
import { MoeAuthStore } from '../stores/store'
import message from '../utils/message'

const router = useRouter()
const route = useRoute()
const MoeAuth = MoeAuthStore()

const loginType = ref('phone')
const loading = ref(false)
const showAccountSelection = ref(false)
const accountList = ref([])
const countdown = ref(0)
const isSendingCaptcha = ref(false)
const qrCodeUrl = ref('')
const qrStatus = ref('waiting')
const qrKey = ref('')
const qrCheckInterval = ref(null)

const phoneForm = reactive({
  mobile: '',
  code: ''
})

const phoneFormErrors = reactive({
  mobile: '',
  code: ''
})

const validateField = (field, value) => {
  if (field === 'mobile') {
    if (!value) {
      phoneFormErrors.mobile = '请输入手机号'
    } else if (!/^1[3-9]\d{9}$/.test(value)) {
      phoneFormErrors.mobile = '请输入正确的手机号'
    } else {
      phoneFormErrors.mobile = ''
    }
  } else if (field === 'code') {
    if (!value) {
      phoneFormErrors.code = '请输入验证码'
    } else if (value.length !== 6) {
      phoneFormErrors.code = '请输入6位验证码'
    } else {
      phoneFormErrors.code = ''
    }
  }
}

const sendCode = async () => {
  validateField('mobile', phoneForm.mobile)
  if (phoneFormErrors.mobile) return

  try {
    isSendingCaptcha.value = true
    const response = await get(`/captcha/sent?mobile=${phoneForm.mobile}`)
    
    if (response.status === 1) {
      message.success('验证码已发送')
      countdown.value = 60
      const timer = setInterval(() => {
        countdown.value--
        if (countdown.value <= 0) {
          clearInterval(timer)
        }
      }, 1000)
    } else {
      message.error(response.data || '发送失败')
    }
  } catch (error) {
    message.error('发送失败，请稍后重试')
  } finally {
    isSendingCaptcha.value = false
  }
}

const phoneLogin = async (userid) => {
  validateField('mobile', phoneForm.mobile)
  validateField('code', phoneForm.code)
  
  if (phoneFormErrors.mobile || phoneFormErrors.code) return

  try {
    loading.value = true
    let url = `/login/cellphone?mobile=${phoneForm.mobile}&code=${phoneForm.code}`
    if (userid) url += `&userid=${userid}`
    const response = await get(url)

    if (response.status === 1) {
      const data = response.data
      
      if (data?.info_list && data.info_list.length > 1) {
        accountList.value = data.info_list
        showAccountSelection.value = true
      } else {
        const userInfo = data?.info_list?.[0] || data
        await MoeAuth.setData({ UserInfo: userInfo })
        message.success('登录成功')

        // 重新注册设备获取新dfid + 强制从服务器获取最新VIP信息
        await MoeAuth.initDevice(true)
        try { await MoeAuth.fetchVipInfo() } catch (e) { console.warn('登录后获取VIP信息失败:', e?.message) }

        const redirect = route.query.redirect || '/profile'
        router.push(redirect)
      }
    } else {
      if (response.error_code === 34182 || response.data === '该账号不存在') {
        message.error('登录失败，请先用酷狗音乐注册')
      } else {
        message.error(response.data || '登录失败')
      }
    }
  } catch (error) {
    if (error.response?.data?.data?.info_list) {
      accountList.value = error.response.data.data.info_list
      showAccountSelection.value = true
    } else {
      if (error.response?.data?.error_code === 34182 || error.response?.data?.data === '该账号不存在') {
        message.error('登录失败，请先用酷狗音乐注册')
      } else {
        message.error('登录失败，请稍后重试')
      }
    }
  } finally {
    loading.value = false
  }
}

const generateQRCode = async () => {
  try {
    qrStatus.value = 'waiting'
    qrCodeUrl.value = ''
    
    const keyResponse = await get('/login/qr/key')
    if (keyResponse.status === 1) {
      qrKey.value = keyResponse.data.qrcode
      
      const qrResponse = await get(`/login/qr/create?key=${qrKey.value}&qrimg=true`)
      
      if (qrResponse.code === 200) {
        qrCodeUrl.value = qrResponse.data.base64
        startQRCheck()
      } else {
        message.error('生成二维码失败')
      }
    } else {
      message.error('获取二维码key失败')
    }
  } catch (error) {
    message.error('生成二维码失败')
  }
}

const startQRCheck = () => {
  if (qrCheckInterval.value) {
    clearInterval(qrCheckInterval.value)
  }

  qrCheckInterval.value = setInterval(async () => {
    try {
      const response = await get(`/login/qr/check?key=${qrKey.value}&timestamp=${Date.now()}`, {}, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      if (response.status === 1) {
        if (response.data.status === 2) {
          qrStatus.value = 'scanned'
        } else if (response.data.status === 4) {
          qrStatus.value = 'confirmed'
          clearInterval(qrCheckInterval.value)
          
          const userInfo = response.data
          await MoeAuth.setData({ UserInfo: userInfo })
          message.success('登录成功')

          // 重新注册设备获取新dfid + 强制从服务器获取最新VIP信息
          await MoeAuth.initDevice(true)
          try { await MoeAuth.fetchVipInfo() } catch (e) { console.warn('登录后获取VIP信息失败:', e?.message) }

          const redirect = route.query.redirect || '/profile'
          router.push(redirect)
        } else if (response.data.status === 0) {
          qrStatus.value = 'expired'
          clearInterval(qrCheckInterval.value)
          message.error('二维码已过期，请重新扫码')
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('QR check error:', error)
    }
  }, 1000)
}

const selectAccount = async (account) => {
  loading.value = true
  await phoneLogin(account.userid)
}

const backToLogin = () => {
  showAccountSelection.value = false
  accountList.value = []
}

onMounted(() => {
  if (MoeAuth.isAuthenticated) {
    const redirect = route.query.redirect || '/profile'
    router.push(redirect)
  }
})

watch(loginType, (newType) => {
  if (newType === 'qr') {
    generateQRCode()
  }
})

onUnmounted(() => {
  if (qrCheckInterval.value) {
    clearInterval(qrCheckInterval.value)
  }
})
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-box {
  width: 100%;
  max-width: 400px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 40px 30px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.logo-section {
  text-align: center;
  margin-bottom: 30px;
}

.logo-section i {
  font-size: 48px;
  color: #667eea;
  margin-bottom: 10px;
}

.logo-section h1 {
  font-size: 28px;
  color: #333;
  margin-bottom: 8px;
}

.logo-section p {
  color: #999;
  font-size: 14px;
}

.login-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
}

.login-tabs button {
  flex: 1;
  padding: 12px;
  border: 2px solid #e0e0e0;
  background: white;
  border-radius: 10px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.login-tabs button:hover {
  border-color: #667eea;
  color: #667eea;
}

.login-tabs button.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-color: transparent;
  color: white;
}

.login-content {
  margin-bottom: 20px;
}

.input-group {
  position: relative;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  background: #f5f5f5;
  border-radius: 10px;
  padding: 12px 15px;
  transition: all 0.3s;
}

.input-group:focus-within {
  background: white;
  box-shadow: 0 0 0 2px #667eea;
}

.input-group i {
  color: #999;
  font-size: 18px;
  margin-right: 10px;
}

.input-group input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  color: #333;
  outline: none;
}

.input-group input.verification-input {
  max-width: 6em;
}

.input-group .spacer {
  flex: 1;
}

.input-group input::placeholder {
  color: #999;
}

.clear-button {
  background: none;
  border: none;
  color: #999;
  font-size: 20px;
  cursor: pointer;
  padding: 0 5px;
  transition: color 0.3s;
}

.clear-button:hover {
  color: #667eea;
}

.send-code-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  color: white;
  padding: 8px 15px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.3s;
}

.send-code-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.send-code-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-btn {
  width: 100%;
  padding: 15px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-text {
  color: #ff4757;
  font-size: 12px;
  margin-top: -15px;
  margin-bottom: 15px;
  padding-left: 5px;
}

.input-group.has-error {
  box-shadow: 0 0 0 2px #ff4757;
}

.qr-container {
  text-align: center;
  padding: 20px;
}

.qr-code {
  position: relative;
  display: inline-block;
}

.qr-code img {
  width: 200px;
  height: 200px;
  border-radius: 10px;
}

.qr-expired,
.qr-scanned,
.qr-confirmed {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
}

.qr-expired p,
.qr-scanned p,
.qr-confirmed p {
  margin-bottom: 10px;
  color: #333;
}

.qr-expired button {
  padding: 8px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  cursor: pointer;
}

.qr-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.qr-loading p {
  color: #999;
}

.qr-tip {
  text-align: center;
  color: #999;
  font-size: 14px;
  margin-top: 15px;
}

.account-selection {
  text-align: center;
}

.selection-tip {
  color: #666;
  font-size: 14px;
  margin-bottom: 20px;
}

.account-list {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 20px;
}

.account-item {
  display: flex;
  align-items: center;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.3s;
}

.account-item:hover {
  background: #e8e8e8;
  transform: translateX(5px);
}

.account-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  overflow: hidden;
  margin-right: 15px;
}

.account-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-info {
  flex: 1;
  text-align: left;
}

.account-name {
  font-weight: 600;
  color: #333;
  margin-bottom: 5px;
}

.account-status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.svip-badge {
  background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%);
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.user-level {
  color: #999;
}

.select-arrow {
  font-size: 20px;
  color: #667eea;
}

.back-button {
  width: 100%;
  padding: 12px;
  background: #f5f5f5;
  border: none;
  border-radius: 10px;
  color: #666;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.3s;
}

.back-button:hover {
  background: #e8e8e8;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
