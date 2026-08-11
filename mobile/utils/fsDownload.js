const log = (...args) => {
  console.log('[fsDownload]', ...args)
}

const STORAGE_KEY = 'moekoe_download_dir_handle'

export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/**
 * 从 IndexedDB 或 session 缓存加载之前保存的目录句柄
 */
export async function loadCachedDirectory() {
  try {
    // 优先从 session 内存缓存读取
    if (window.__cachedDownloadDirHandle) {
      log('从内存缓存加载目录:', window.__cachedDownloadDirHandle.name)
      return window.__cachedDownloadDirHandle
    }

    // 从 IndexedDB 读取（需要持久化存储支持）
    if ('indexedDB' in window) {
      const saved = await loadFromIndexedDB(STORAGE_KEY)
      if (saved) {
        // 保存到内存缓存，避免重复读取
        window.__cachedDownloadDirHandle = saved
        log('从 IndexedDB 加载目录:', saved.name)
        return saved
      }
    }

    return null
  } catch (err) {
    log('加载缓存目录失败:', err)
    return null
  }
}

/**
 * 保存目录句柄到缓存（内存 + IndexedDB）
 */
export async function cacheDirectory(dirHandle) {
  // 保存到内存缓存（当前会话有效）
  window.__cachedDownloadDirHandle = dirHandle

  // 尝试保存到 IndexedDB（跨会话有效）
  if ('indexedDB' in window) {
    try {
      await saveToIndexedDB(STORAGE_KEY, dirHandle)
      log('目录句柄已保存到 IndexedDB')
    } catch (err) {
      // IndexedDB 不支持存储 FileSystemHandle 是正常的（某些浏览器版本）
      // 内存缓存已足够当前会话使用
      log('IndexedDB 持久化跳过（当前浏览器可能不支持），使用内存缓存')
    }
  }
}

/**
 * 清除缓存的目录句柄
 */
export async function clearCachedDirectory() {
  window.__cachedDownloadDirHandle = null
  if ('indexedDB' in window) {
    try {
      await deleteFromIndexedDB(STORAGE_KEY)
    } catch (err) {
      // 忽略错误
    }
  }
  log('已清除缓存目录')
}

export async function pickDownloadDirectory() {
  if (!isFileSystemAccessSupported()) {
    throw new Error('当前浏览器不支持 File System Access API，请使用 Chrome 或 Edge 浏览器')
  }
  const dirHandle = await window.showDirectoryPicker({
    mode: 'readwrite',
    startIn: 'downloads'
  })
  log('选择了下载目录:', dirHandle.name)
  
  // 缓存目录句柄
  await cacheDirectory(dirHandle)
  
  return dirHandle
}

export async function saveBlobToDirectory(blob, rootDir, artist, album, fileName) {
  const safeArtist = sanitizeFileName(artist || '未知歌手')
  const safeAlbum = sanitizeFileName(album || '未知专辑')
  const safeFileName = sanitizeFileName(fileName)

  log('保存文件:', `${safeArtist}/${safeAlbum}/${safeFileName}`)

  const artistDir = await rootDir.getDirectoryHandle(safeArtist, { create: true })
  const albumDir = await artistDir.getDirectoryHandle(safeAlbum, { create: true })
  const fileHandle = await albumDir.getFileHandle(safeFileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()

  log('文件保存成功:', `${safeArtist}/${safeAlbum}/${safeFileName}`)
  return `${safeArtist}/${safeAlbum}/${safeFileName}`
}

/**
 * 回退下载：使用浏览器原生下载（不支持文件夹结构）
 * 保留原始文件名，不添加额外信息
 */
export function fallbackDownloadBlob(blob, artist, album, fileName) {
  const safeFileName = sanitizeFileName(fileName)
  
  // 直接使用原始文件名，不修改
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = safeFileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
  
  log('已触发原生下载:', safeFileName)
}

function sanitizeFileName(name) {
  if (!name) return '未知'
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

// ==================== IndexedDB 辅助函数 ====================

const DB_NAME = 'MoeKoeDownload'
const DB_VERSION = 1
const STORE_NAME = 'settings'

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveToIndexedDB(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ key, value })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadFromIndexedDB(key) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result?.value || null)
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    return null
  }
}

async function deleteFromIndexedDB(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
