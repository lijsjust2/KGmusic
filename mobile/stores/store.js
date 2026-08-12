import { defineStore } from 'pinia';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { get as apiGet, post as apiPost } from '../utils/request';
import { detectFnosClientMode } from '../utils/fnos';

const registerDeviceApi = axios.create({
    baseURL: getApiBaseUrl(),
    timeout: 10000,
});

// 生成随机 GUID（32 位 hex），用于强制刷新 dfid 时换新设备标识
const generateRandomGuid = () => {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars[Math.floor(Math.random() * 16)];
    }
    return result;
};

function vipDataIsValid(vipData) {
  if (!vipData) return false;
  const checkExpiry = (et) => et && new Date(et) > new Date();
  if (vipData.is_vip === 1 && checkExpiry(vipData.vip_end_time || vipData.end_time)) return true;
  if (vipData.busi_vip && Array.isArray(vipData.busi_vip)) {
    if (vipData.busi_vip.some(v => v && checkExpiry(v.vip_end_time || v.end_time))) return true;
  }
  if (vipData?.data) {
    if (checkExpiry(vipData.data.expire_time || vipData.data.due_date || vipData.data.vip_end_time)) return true;
  }
  return false;
}

export const MoeAuthStore = defineStore('MoeData', {
    state: () => ({
        UserInfo: null,
        Config: null,
        Device: null,
        vipInfo: null,
    }),
    actions: {
        fetchConfig(key) {
            if (!this.Config) return null;
            const configItem = this.Config.find(item => item.key === key);
            return configItem ? configItem.value : null;
        },
        async setData(data) {
            if (data.UserInfo) {
                this.UserInfo = data.UserInfo;
                if (data.Config) {
                    this.Config = data.Config;
                }
            } else if (data.Config) {
                this.Config = data.Config;
            }
        },
        clearUserData() {
            this.UserInfo = null;
            this.Config = null;
            this.vipInfo = null;
            this.Device = null;
            localStorage.removeItem('cachedVipInfo');
            localStorage.removeItem('cachedVipUserId');
            localStorage.removeItem('lastVipClaimDate');
            localStorage.removeItem('like');
            localStorage.removeItem('collectedPlaylists');
            localStorage.removeItem('t');
        },
        // ===== 后端集中管理登录态（仅飞牛环境；浏览器直连用 localStorage 独立管理）=====
        // 登录成功后把 token 存到后端
        async saveTokenToServer() {
            // 仅飞牛环境（.fpk 内嵌入口）走后端共享 token；浏览器直连不污染后端
            if (!detectFnosClientMode()) return;
            try {
                await apiPost('/auth/save', {
                    userInfo: this.UserInfo,
                    device: this.Device,
                });
            } catch (e) {
                console.warn('[AUTH] 保存 token 到后端失败:', e?.message);
            }
        },
        // 从后端拉取共享 token（启动时调用）
        async fetchTokenFromServer() {
            // 仅飞牛环境从后端拉取共享 token；浏览器直连返回 null，用本地登录态
            if (!detectFnosClientMode()) return null;
            try {
                const res = await apiGet('/auth/get');
                if (res?.status === 1 && res?.data?.userInfo?.token) {
                    return res.data;
                }
            } catch (e) {
                console.warn('[AUTH] 从后端拉取 token 失败:', e?.message);
            }
            return null;
        },
        // 退出登录时清空后端存储
        async clearTokenOnServer() {
            // 仅飞牛环境清空后端共享 token；浏览器直连只清本地 localStorage
            if (!detectFnosClientMode()) return;
            try {
                await apiPost('/auth/clear');
            } catch (e) {
                console.warn('[AUTH] 清空后端 token 失败:', e?.message);
            }
        },
        clearData() {
            this.clearUserData();
        },
        async validateToken() {
            if (!this.UserInfo?.token) return false;
            // 不再吞掉网络错误：网络异常会抛出，由调用方 catch 区分"网络抖动"和"token 真的失效"
            // 返回 true=有效，false=token 失效（status!==1），抛出=网络错误
            const response = await apiGet('/user/detail');
            return response?.status === 1;
        },
        async refreshToken() {
            if (!this.UserInfo?.token || !this.UserInfo?.userid) return null;
            // 不再吞掉网络错误：网络异常会抛出，由调用方 catch 区分
            // 返回对象=刷新成功，null=token 真的失效（status!==1），抛出=网络错误
            const response = await apiGet('/login/token', {
                token: this.UserInfo.token,
                userid: this.UserInfo.userid,
            });
            if (response?.status === 1 && response?.data?.token) {
                const updated = { ...this.UserInfo, ...response.data, token: response.data.token };
                this.UserInfo = updated;
                // 刷新成功后同步到后端，让所有设备共享新 token
                this.saveTokenToServer();
                return updated;
            }
            return null;
        },
        async initDevice(forceRefresh = false) {
            // 有缓存且不强制刷新时直接返回（20028风控时需要forceRefresh强制重新注册dfid）
            if (!forceRefresh && this.Device) return this.Device;
            try {
                // 强制刷新时换新 GUID，避免酷我对相同设备返回相同失效 dfid
                const headers = { 'Cache-Control': 'no-store' };
                if (forceRefresh) {
                    const newGuid = generateRandomGuid();
                    headers['Cookie'] = `KUGOU_API_GUID=${newGuid}`;
                }
                const response = await registerDeviceApi.get('/register/dev?register', { headers });
                const device = response?.data?.data;
                if (device) {
                    this.Device = device;
                    return device;
                }
            } catch (error) {
                console.error('Failed to register device:', error);
            }
            return null;
        },

        async fetchVipInfo() {
            const response = await apiGet('/youth/union/vip');
            if (response.status === 1) {
                this.vipInfo = response.data;
                return response.data;
            }
            // status===2 表示登录失效，抛出特定错误让调用方区分"登录失效"和"网络/其它错误"
            if (response.status === 2) {
                const err = new Error('LOGIN_EXPIRED');
                err.code = 'LOGIN_EXPIRED';
                throw err;
            }
            return null;
        },

        async claimDayVip(receiveDay) {
            const response = await apiGet('/youth/day/vip', { receive_day: receiveDay });
            return response;
        },

        async upgradeDayVip() {
            const response = await apiGet('/youth/day/vip/upgrade');
            return response;
        },

        async claimHourVip() {
            const response = await apiGet('/youth/vip');
            return response;
        },

        async autoClaimVip() {
            const todayKey = new Date().toISOString().split('T')[0];
            const lastClaimDate = localStorage.getItem('lastVipClaimDate');
            const currentUserId = this.UserInfo?.userid;

            const cachedVipInfo = localStorage.getItem('cachedVipInfo');
            const cachedUserId = localStorage.getItem('cachedVipUserId');

            if (cachedVipInfo && cachedUserId === currentUserId && vipDataIsValid(JSON.parse(cachedVipInfo))) {
                return;
            }

            try {
                const res = await this.fetchVipInfo();
                if (!res) return;
                localStorage.setItem('cachedVipInfo', JSON.stringify(res));
                localStorage.setItem('cachedVipUserId', currentUserId);
            } catch {
                return;
            }

            if (this.isVip) {
                localStorage.setItem('lastVipClaimDate', todayKey);
                return;
            }

            if (lastClaimDate === todayKey) return;

            try {
                const dayRes = await this.claimDayVip(todayKey);
                if (dayRes.status === 1) {
                    await this.upgradeDayVip();
                    const updated = await this.fetchVipInfo();
                    if (updated) {
                        localStorage.setItem('cachedVipInfo', JSON.stringify(updated));
                        localStorage.setItem('cachedVipUserId', currentUserId);
                        if (this.isVip) {
                            localStorage.setItem('lastVipClaimDate', todayKey);
                        }
                    }
                } else {
                    localStorage.setItem('lastVipClaimDate', todayKey);
                }
            } catch {
                localStorage.setItem('lastVipClaimDate', todayKey);
            }
        },
    },
    getters: {
        isAuthenticated: (state) => !!state.UserInfo,
        isVip: (state) => vipDataIsValid(state.vipInfo),
        isConceptVip: (state) => {
            if (!state.vipInfo?.busi_vip || !Array.isArray(state.vipInfo.busi_vip)) {
                return false;
            }
            return state.vipInfo.busi_vip.some(vip => {
                return vip?.busi_type === 'concept' && new Date(vip.vip_end_time || vip.end_time) > new Date();
            });
        },
        vipStatusText: (state) => {
            if (!state.vipInfo) return '';
            const checkVip = (data) => {
                if (data.is_vip === 1) {
                    const et = data.vip_end_time || data.end_time;
                    if (et && new Date(et) > new Date()) return et;
                }
                if (data.busi_vip && Array.isArray(data.busi_vip)) {
                    const valid = data.busi_vip.filter(v => v && v.vip_end_time && new Date(v.vip_end_time) > new Date());
                    if (valid.length > 0) {
                        const longest = valid.reduce((a, b) =>
                            new Date(a.vip_end_time).getTime() > new Date(b.vip_end_time).getTime() ? a : b
                        );
                        return longest.vip_end_time;
                    }
                }
                return null;
            };
            const expireTime = checkVip(state.vipInfo);
            if (!expireTime) return '';
            const d = new Date(expireTime);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        },
        vipDisplayList: (state) => {
            if (!state.vipInfo) return [];
            const list = [];
            if (state.vipInfo.is_vip === 1) {
                const et = state.vipInfo.vip_end_time || state.vipInfo.end_time;
                if (et && new Date(et) > new Date()) {
                    list.push({ type: '普通VIP', expireTime: et });
                }
            }
            if (state.vipInfo.busi_vip && Array.isArray(state.vipInfo.busi_vip)) {
                const typeMap = { 'concept': '概念版VIP', 'dvip': '畅听VIP', 'qvip': '超级VIP' };
                state.vipInfo.busi_vip.forEach(v => {
                    if (!v) return;
                    const et = v.vip_end_time || v.end_time;
                    if (et && new Date(et) > new Date()) {
                        list.push({ type: typeMap[v.busi_type] || 'VIP', expireTime: et });
                    }
                });
            }
            const map = new Map();
            list.forEach(item => {
                const key = item.expireTime;
                if (!map.has(key)) {
                    map.set(key, { ...item });
                } else {
                    const existing = map.get(key);
                    const types = existing.type.split('、');
                    if (!types.includes(item.type)) {
                        existing.type = `${existing.type}、${item.type}`;
                    }
                }
            });
            return Array.from(map.values());
        },
    },
    persist: {
        enabled: true,
        strategies: [
            {
                key: 'MoeData',
                storage: localStorage,
                paths: ['UserInfo', 'Config', 'Device'],
            },
        ],
    },
});
