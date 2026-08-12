// src/services/request.js
import axios from 'axios';
import { MoeAuthStore } from '../stores/store';
import { getApiBaseUrl } from './apiBaseUrl';
import { detectFnosClientMode } from './fnos';
import message from './message';

// 创建一个 axios 实例
const httpClient = axios.create({
    baseURL: getApiBaseUrl(),
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

// 请求拦截器
// 两种模式：
//  - 飞牛模式（.fpk 内嵌入口）：不拼 Authorization，加 X-FNOS-Mode: 1 标记
//                   后端中间层读 .kugou_auth.json 注入共享 cookie，保证所有飞牛端完全一致
//  - 浏览器直连：按原有逻辑拼 Authorization（token/userid/dfid/mid/guid 等），localStorage 独立
httpClient.interceptors.request.use(
    config => {
        if (detectFnosClientMode()) {
            config.headers = {
                ...config.headers,
                'X-FNOS-Mode': '1',
            };
            return config;
        }

        const MoeAuth = MoeAuthStore();
        const token = MoeAuth.UserInfo?.token;
        const userid = MoeAuth.UserInfo?.userid;
        const t1 = MoeAuth.UserInfo?.t1;
        const dfid = MoeAuth.Device?.dfid;
        const mid = MoeAuth.Device?.mid;
        const guid = MoeAuth.Device?.guid;
        const serverDev = MoeAuth.Device?.serverDev;
        const mac = MoeAuth.Device?.mac;

        const authParts = [];
        if (token) authParts.push(`token=${token}`);
        if (userid) authParts.push(`userid=${userid}`);
        if (t1) authParts.push(`t1=${t1}`);
        if (dfid) authParts.push(`dfid=${dfid}`);
        if (mid) authParts.push(`KUGOU_API_MID=${(mid)}`);
        if (guid) authParts.push(`KUGOU_API_GUID=${(guid)}`);
        if (serverDev) authParts.push(`KUGOU_API_DEV=${(serverDev)}`);
        if (mac) authParts.push(`KUGOU_API_MAC=${(mac)}`);

        if (authParts.length > 0) {
            config.headers = {
                ...config.headers,
                Authorization: authParts.join(';')
            };
        }
        return config;
    },
    error => Promise.reject(error)
);

// 响应拦截器
httpClient.interceptors.response.use(
    response => {
        return response.data;
    },
    async error => {
        if (error.response) {
            const status = error.response.status;

            if (status === 401) {
                const MoeAuth = MoeAuthStore();

                if (error.config?._retry) {
                    MoeAuth.clearUserData();
                    message.error('登录已失效，请重新登录');
                    setTimeout(() => { window.location.hash = '#/login'; }, 500);
                    return Promise.reject(error);
                }

                if (MoeAuth.UserInfo?.token && MoeAuth.UserInfo?.userid) {
                    // refresh 最多尝试 2 次（应对网络波动导致首次 refresh 失败）
                    for (let refreshAttempt = 0; refreshAttempt < 2; refreshAttempt++) {
                        try {
                            // 复用 MoeAuth.refreshToken()：它用 apiGet（httpClient），
                            // 会带完整的 Authorization header（含 dfid、KUGOU_API_GUID/MAC/DEV 等），
                            // login_token.js 在 lite 模式下需要这些参数生成 t2 加密
                            const refreshed = await MoeAuth.refreshToken();
                            if (refreshed) {
                                const retryConfig = { ...error.config, _retry: true };
                                return httpClient(retryConfig);
                            }
                            // refresh 返回 null（status!=1）说明 token 真的失效了，不再重试
                            break;
                        } catch (refreshErr) {
                            // 网络异常才重试，其它错误直接放弃
                            const isNetworkError = !refreshErr?.response;
                            if (!isNetworkError || refreshAttempt === 1) {
                                console.warn('[401] refresh token 失败:', refreshErr?.message);
                                break;
                            }
                            // 网络波动，等 1 秒重试一次
                            console.warn('[401] refresh token 网络异常，1 秒后重试:', refreshErr?.message);
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }
                }

                MoeAuth.clearUserData();
                message.error('登录已失效，请重新登录');
                setTimeout(() => { window.location.hash = '#/login'; }, 500);
                return Promise.reject(error);
            }

            if (error.response?.data) {
                const errorData = error.response.data;
                const errorMsg = errorData.error || errorData.msg || errorData.error_msg || '';
                const errcode = errorData.errcode || errorData.error_code;

                if (errcode === 131001 || errcode === 297002) {
                    return Promise.reject(error);
                }

                // 酷狗风控：errcode=20028 说明 dfid(设备ID)失效 → 强制重新注册设备后重试一次
                const needVerify = errcode === 20028 ||
                    (typeof errorMsg === 'string' && errorMsg.includes('需要验证'));
                if (needVerify && !error.config?._dfidRetry) {
                    try {
                        const MoeAuth = MoeAuthStore();
                        // 先清空旧 Device，再强制重新注册获取新 dfid
                        MoeAuth.Device = null;
                        await MoeAuth.initDevice(true);
                        const retryConfig = { ...error.config, _dfidRetry: true };
                        return httpClient(retryConfig);
                    } catch (dfidErr) {
                        console.warn('[20028] 刷新dfid失败，仍走原错误逻辑:', dfidErr?.message);
                    }
                }

                if (errorMsg.includes('需要验证') || errorMsg.includes('需要登录') || errcode === 20028) {
                    return Promise.reject(error);
                }

                if (errorData.error_code || errorData.error_msg) {
                    return Promise.reject(error);
                }
                message.error('服务器错误,请稍后再试!');
            } else {
                message.error('服务器错误,请稍后再试!');
            }
        } else if (error.request) {
            message.error('服务器未响应,请稍后再试!');
        } else {
            message.error('请求错误,请稍后再试!');
        }
        return Promise.reject(error);
    }
);

// 封装 GET 请求
export const get = async (url, params = {}, config = {}, onSuccess = null, onError = null) => {
    try {
        const response = await httpClient.get(url, { params, ...config });
        if (onSuccess) onSuccess(response);
        return response;
    } catch (error) {
        if (onError) onError(error);
        throw error;
    }
};

// 封装 POST 请求
export const post = async (url, data = {}, config = {}, onSuccess = null, onError = null) => {
    try {
        const response = await httpClient.post(url, data, config);
        if (onSuccess) onSuccess(response);
        return response;
    } catch (error) {
        if (onError) onError(error);
        throw error;
    }
};

// 封装 PUT 请求
export const put = async (url, data = {}, config = {}, onSuccess = null, onError = null) => {
    try {
        const response = await httpClient.put(url, data, config);
        if (onSuccess) onSuccess(response);
        return response;
    } catch (error) {
        if (onError) onError(error);
        throw error;
    }
};

// 封装 DELETE 请求
export const del = async (url, config = {}, onSuccess = null, onError = null) => {
    try {
        const response = await httpClient.delete(url, config);
        if (onSuccess) onSuccess(response);
        return response;
    } catch (error) {
        if (onError) onError(error);
        throw error;
    }
};

// 封装 PATCH 请求
export const patch = async (url, data = {}, config = {}, onSuccess = null, onError = null) => {
    try {
        const response = await httpClient.patch(url, data, config);
        if (onSuccess) onSuccess(response);
        return response;
    } catch (error) {
        if (onError) onError(error);
        throw error;
    }
};

// 封装上传图片请求
export const uploadImage = async (url, file, additionalData = {}, config = {}, onSuccess = null, onError = null) => {
    try {
        const formData = new FormData();
        formData.append('file', file);

        // 如果有其他数据（如关联的商品信息等），也可以添加到 formData
        for (const key in additionalData) {
            if (Object.prototype.hasOwnProperty.call(additionalData, key)) {
                formData.append(key, additionalData[key]);
            }
        }

        // 需要确保 Content-Type 被设置为 multipart/form-data
        const response = await httpClient.post(url, formData, {
            ...config,
            headers: {
                ...config.headers,
                'Content-Type': 'multipart/form-data'
            }
        });

        if (onSuccess) onSuccess(response);
        return response;
    } catch (error) {
        if (onError) onError(error);
        throw error;
    }
};

// 导出 httpClient 以便在需要的时候直接使用 axios 实例
export default httpClient;