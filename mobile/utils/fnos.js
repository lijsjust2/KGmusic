import { get, post } from './request'

const log = (...args) => {
  console.log('[fnos]', ...args)
}

let fnosStatus = null
let statusChecked = false
let checkingPromise = null

/**
 * 检测当前是否运行在飞牛 fnOS 环境下
 * 首次调用会请求后端 /fnos/status，后续返回缓存结果
 * @returns {Promise<{isFnos: boolean, downloadDir: string, enabled: boolean}>}
 */
export async function checkFnosEnv() {
  if (statusChecked) return fnosStatus
  if (checkingPromise) return checkingPromise

  checkingPromise = (async () => {
    try {
      const res = await get('/fnos/status', {}, { timeout: 5000 })
      fnosStatus = {
        isFnos: !!res?.isFnos,
        downloadDir: res?.downloadDir || '',
        enabled: !!res?.enabled,
      }
      log('飞牛环境检测结果:', fnosStatus)
    } catch (e) {
      log('飞牛环境检测失败，视为非飞牛环境:', e?.message)
      fnosStatus = { isFnos: false, downloadDir: '', enabled: false }
    }
    statusChecked = true
    checkingPromise = null
    return fnosStatus
  })()

  return checkingPromise
}

/**
 * 同步获取已缓存的飞牛环境状态
 * 如果尚未检测过，返回默认的非飞牛状态
 * @returns {{isFnos: boolean, downloadDir: string, enabled: boolean}}
 */
export function getFnosStatus() {
  return fnosStatus || { isFnos: false, downloadDir: '', enabled: false }
}

/**
 * 在飞牛环境下，通过后端下载文件到共享目录
 * @param {string} url 音频文件下载URL
 * @param {string} fileName 保存的文件名
 * @param {string} artist 歌手名（仅 categorize=true 时使用）
 * @param {string} album 专辑名（仅 categorize=true 时使用）
 * @param {boolean} [categorize=false] 是否按「歌手/专辑」分类存储
 *   - true：批量下载（/download/ 页面）按「歌手/专辑/文件名」分类
 *   - false（默认）：单曲及其他列表下载直接放到根目录，不分类
 * @returns {Promise<{success: boolean, path?: string, msg?: string}>}
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
 * 关闭页面/飞牛后任务仍会在容器内继续执行，重新打开应用可见悬浮提示
 * @param {Array} songs 歌曲列表
 * @param {Object|string} quality 音质配置（对象 {quality:'flac'} 或字符串）
 * @param {number} delayMin 防风控最小延时（秒）
 * @param {number} delayMax 防风控最大延时（秒）
 * @returns {Promise<{success:boolean, batchId?:string, added?:number, msg?:string}>}
 */
export async function addToDownloadQueue(songs, quality, delayMin = 1, delayMax = 3, pushplusToken = '') {
  try {
    const res = await post(
      '/fnos/queue/add',
      { songs, quality, delayMin, delayMax, pushplusToken },
      { timeout: 30000 }
    )
    if (res?.code === 0) {
      log('已加入下载队列:', res.data?.batchId, '共', res.data?.added, '首')
      return { success: true, batchId: res.data?.batchId, added: res.data?.added }
    }
    return { success: false, msg: res?.msg || '加入队列失败' }
  } catch (e) {
    log('加入下载队列失败:', e?.message)
    return { success: false, msg: e?.message || '加入队列请求失败' }
  }
}

/**
 * 查询后台下载队列状态（前端轮询用）
 * @returns {Promise<Object|null>} 队列状态数据，非飞牛环境或失败返回 null
 */
export async function getDownloadQueueStatus() {
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
 * @param {Object} param0 { batchId, taskId, all }
 * @returns {Promise<{success:boolean, cancelled?:number, msg?:string}>}
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
 * @returns {Promise<{success:boolean, cleared?:number, msg?:string}>}
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
