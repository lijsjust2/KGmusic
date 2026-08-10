import { defineStore } from 'pinia';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { get as apiGet } from '../utils/request';

const registerDeviceApi = axios.create({
    baseURL: getApiBaseUrl(),
    timeout: 10000,
});

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
        clearData() {
            this.clearUserData();
        },
        async validateToken() {
            if (!this.UserInfo?.token) return false;
            try {
                const response = await apiGet('/user/detail');
                return response?.status === 1;
            } catch {
                return false;
            }
        },
        async refreshToken() {
            if (!this.UserInfo?.token || !this.UserInfo?.userid) return null;
            try {
                const response = await apiGet('/login/token', {
                    token: this.UserInfo.token,
                    userid: this.UserInfo.userid,
                });
                if (response?.status === 1 && response?.data?.token) {
                    const updated = { ...this.UserInfo, ...response.data, token: response.data.token };
                    this.UserInfo = updated;
                    return updated;
                }
            } catch {
                return null;
            }
            return null;
        },
        async initDevice(forceRefresh = false) {
            // 有缓存且不强制刷新时直接返回（20028风控时需要forceRefresh强制重新注册dfid）
            if (!forceRefresh && this.Device) return this.Device;
            try {
                const response = await registerDeviceApi.get('/register/dev?register', {
                    headers: { 'Cache-Control': 'no-store' }
                });
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
