import { get, post } from './request'

const log = (...args) => {
  console.log('[fnos]', ...args)
}

const CLIENT_FLAG_KEY = 'KGmusic_fnosClientMode'
const URL_QUERY_FLAG = 'fnos_app'

let fnosStatus = null
let statusChecked = false
let checkingPromise = null

/**
 * 检测「客户端是否是从飞牛内嵌入口打开」
 *  优先级：
 *   1. 当前 URL query 带 ?fnos_app=1（飞牛桌面图标点开时 fnap/app/ui/config 写入）
 *   2. localStorage 中缓存了 KGmusic_fnosClientMode=1（用户通过飞牛入口访问过一次后 SPA 路由跳转不会丢）
 *
 *  注意：外部浏览器直接访问 IP:8880 时，两者都不存在，因此返回 false
 */
export function detectFnosClientMode() {
  try {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get(URL_QUERY_FLAG)
    if (fromUrl === '1' || fromUrl === 'true') {
      localStorage.setItem(CLIENT_FLAG_KEY, '1')
      return true
    }
    // 兜底：hash 路由下 query 可能写在 hash 里，比如 /#/?fnos_app=1
    const hash = window.location.hash || ''
    if (hash.includes(`${URL_QUERY_FLAG}=1`) || hash.includes(`${URL_QUERY_FLAG}=true`)) {
      localStorage.setItem(CLIENT_FLAG_KEY, '1')
      return true
    }
    return localStorage.getItem(CLIENT_FLAG_KEY) === '1'
  } catch (e) {
    return false
  }
}

/**
 * 手动清除客户端飞牛标识（用于调试）
 */
export function clearFnosClientMode() {
  try { localStorage.removeItem(CLIENT_FLAG_KEY) } catch (_) { /* ignore */ }
}

/**
 * 检测当前是否启用「飞牛下载到共享目录」模式
 * 启用必须同时满足：
 *   1. 服务端跑在飞牛容器内（process.env.FNOS_ENV=true，即 /fnos/status 返回 isFnos: true）
 *   2. 客户端是从飞牛桌面内嵌入口打开（URL 带 ?fnos_app=1 或有 localStorage 标记）
 * 否则（比如容器在飞牛里但用户是局域网 PC 浏览器直连 8880）→ 统一走浏览器下载
 *
 * @returns {Promise<{
 *   isFnosServer: boolean,   // 服务端是否在飞牛容器（有共享目录写入能力）
 *   isFnosClient: boolean,   // 客户端是否从飞牛内嵌入口打开
 *   enabled: boolean,        // 两者同时为 true → 允许下载到飞牛共享目录
 *   downloadDir: string,     // 飞牛共享目录容器内路径（仅 enabled=true 时有意义）
 * }>}
 */
export async function checkFnosEnv() {
  if (statusChecked) return fnosStatus
  if (checkingPromise) return checkingPromise

  const isFnosClient = detectFnosClientMode()

  checkingPromise = (async () => {
    try {
      const res = await get('/fnos/status', {}, { timeout: 5000 })
      const isFnosServer = !!res?.isFnos
      const downloadDir = res?.downloadDir || ''
      const enabled = isFnosServer && isFnosClient

      fnosStatus = { isFnosServer, isFnosClient, enabled, downloadDir }
      log('环境检测结果:', fnosStatus)
    } catch (e) {
      log('环境检测请求失败，视为普通浏览器环境:', e?.message)
      fnosStatus = { isFnosServer: false, isFnosClient, enabled: false, downloadDir: '' }
    }
    statusChecked = true
    checkingPromise = null
    return fnosStatus
  })()

  return checkingPromise
}

/**
 * 同步获取已缓存的飞牛环境状态（未检测过则返回默认的非启用状态）
 */
export function getFnosStatus() {
  return fnosStatus || { isFnosServer: false, isFnosClient: false, enabled: false, downloadDir: '' }
}

/**
 * 在飞牛环境下，通过后端下载文件到共享目录
 * （注意：调用方应先确认 fnosStatus.enabled 再调用）
 */
export async function downloadToFnos(url, fileName, artist, album, categorize = false) {
  try {
    const res = await post(
      '/fnos/download',
      { url, fileName, artist, album, categorize },
      { timeout: 120000 }
    )
    if (res?.code === 0) {
      log('飞牛下载成功:', res.data?.path)
      return { success: true, path: res.data?.path }
    }
    return { success: false, msg: res?.msg || '下载失败' }
  } catch (e) {
    log('飞牛下载请求失败:', e?.message)
    return { success: false, msg: e?.message || '下载请求失败' }
  }
}

/**
 * 批量歌曲加入后台下载队列（飞牛环境）
 * 自动分片：每 80 首一批发送，共享同一个 batchId，避免请求体过大触发 413
 */
export async function addToDownloadQueue(songs, quality, delayMin = 1, delayMax = 3, pushplusToken = '', folder = '') {
  const CHUNK_SIZE = 80
  const chunks = []
  for (let i = 0; i < songs.length; i += CHUNK_SIZE) {
    chunks.push(songs.slice(i, i + CHUNK_SIZE))
  }
  log(`批量下载分片：共 ${songs.length} 首，分 ${chunks.length} 批发送（每批 ${CHUNK_SIZE} 首）`)

  let totalAdded = 0
  let totalSkipped = 0
  let batchId = null
  let firstError = null

  for (let i = 0; i < chunks.length; i++) {
    const isAppend = i > 0 && batchId
    const body = { songs: chunks[i], quality, delayMin, delayMax, pushplusToken, folder }
    if (isAppend) body.batchId = batchId  // 后续分片追加到同一批次
    try {
      const res = await post('/fnos/queue/add', body, { timeout: 30000 })
      if (res?.code === 0) {
        if (!batchId) batchId = res.data?.batchId
        totalAdded += res.data?.added || 0
        totalSkipped += res.data?.skipped || 0
      } else {
        if (!firstError) firstError = res?.msg || '加入队列失败'
      }
    } catch (e) {
      if (!firstError) firstError = e?.message || '加入队列请求失败'
    }
  }

  if (totalAdded > 0) {
    log('全部分片发送完成，共加入', totalAdded, '首，跳过', totalSkipped, '首')
    return { success: true, batchId, added: totalAdded, skipped: totalSkipped }
  }
  return { success: false, msg: firstError || '加入队列失败' }
}

/**
 * 查询后台下载队列状态（仅飞牛客户端模式下有意义，非飞牛环境返回 null 让上层停止轮询）
 */
export async function getDownloadQueueStatus() {
  // 客户端压根不是飞牛入口打开的，就没必要请求（省带宽，也避免显示悬浮窗）
  if (!detectFnosClientMode()) return null
  try {
    const res = await get('/fnos/queue/status', {}, { timeout: 5000 })
    if (res?.code === 0) return res.data
    return null
  } catch (e) {
    return null
  }
}

/**
 * 取消下载队列中的待执行任务
 */
export async function cancelDownloadQueue({ batchId, taskId, all } = {}) {
  try {
    const res = await post('/fnos/queue/cancel', { batchId, taskId, all }, { timeout: 10000 })
    if (res?.code === 0) {
      return { success: true, cancelled: res.data?.cancelled }
    }
    return { success: false, msg: res?.msg || '取消失败' }
  } catch (e) {
    return { success: false, msg: e?.message || '取消请求失败' }
  }
}

/**
 * 清空下载历史记录
 */
export async function clearDownloadHistory() {
  try {
    const res = await post('/fnos/queue/clear', {}, { timeout: 10000 })
    if (res?.code === 0) {
      return { success: true, cleared: res.data?.cleared }
    }
    return { success: false, msg: res?.msg || '清空失败' }
  } catch (e) {
    return { success: false, msg: e?.message || '清空请求失败' }
  }
}

/**
 * 查询飞牛授权的共享目录列表（用于「下载目录选择」）
 */
export async function listSharedFolders() {
  try {
    const res = await get('/fnos/shared-folders', {}, { timeout: 15000 })
    if (res?.code === 0) return { success: true, folders: res.data?.folders || [], _debug: res.data?._debug || null }
    return { success: false, msg: res?.msg || '获取共享目录失败', _debug: res?._debug || null }
  } catch (e) {
    return { success: false, msg: e?.message || '获取共享目录请求失败' }
  }
}

/**
 * 刷新共享目录列表（强制重新读取授权配置）
 */
export async function refreshSharedFolders() {
  try {
    const res = await post('/fnos/shared-folders/refresh', {}, { timeout: 20000 })
    if (res?.code === 0) return { success: true, folders: res.data?.folders || [], _debug: res.data?._debug || null }
    return { success: false, msg: res?.msg || '刷新共享目录失败', _debug: res?._debug || null }
  } catch (e) {
    return { success: false, msg: e?.message || '刷新共享目录请求失败' }
  }
}
