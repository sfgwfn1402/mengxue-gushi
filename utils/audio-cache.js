// utils/audio-cache.js
// 小程序音频本地缓存：downloadFile -> saveFile -> savedFilePath。
// 用于官方朗读、逐句跟读等远程音频，减少微信真机 HTTPS 播放阶段的 TLS/timeout 抖动。

const STORAGE_KEY = 'audio_file_cache_v1'
const DEFAULT_MAX_BYTES = 80 * 1024 * 1024
const pending = {}
let cacheMap = null

function isRemoteUrl(url) {
  return /^https?:\/\//.test(String(url || ''))
}

function now() {
  return Date.now()
}

function getFs() {
  return wx.getFileSystemManager ? wx.getFileSystemManager() : null
}

function loadMap() {
  if (cacheMap) return cacheMap
  try {
    cacheMap = wx.getStorageSync(STORAGE_KEY) || {}
  } catch (e) {
    cacheMap = {}
  }
  return cacheMap
}

function saveMap() {
  try { wx.setStorageSync(STORAGE_KEY, cacheMap || {}) } catch (e) {}
}

function accessFile(path) {
  const fs = getFs()
  if (!fs || !path) return Promise.resolve(false)
  return new Promise(resolve => {
    fs.access({ path, success: () => resolve(true), fail: () => resolve(false) })
  })
}

function getFileInfo(path) {
  const fs = getFs()
  if (!fs || !path) return Promise.resolve({ size: 0 })
  return new Promise(resolve => {
    fs.getFileInfo({ filePath: path, success: resolve, fail: () => resolve({ size: 0 }) })
  })
}

function removeSavedFile(path) {
  if (!path || !wx.removeSavedFile) return Promise.resolve()
  return new Promise(resolve => {
    wx.removeSavedFile({ filePath: path, complete: () => resolve() })
  })
}

async function getCachedFile(url) {
  if (!isRemoteUrl(url)) return url
  const map = loadMap()
  const item = map[url]
  if (!item || !item.savedFilePath) return ''
  const exists = await accessFile(item.savedFilePath)
  if (!exists) {
    delete map[url]
    saveMap()
    return ''
  }
  item.lastUsedAt = now()
  saveMap()
  return item.savedFilePath
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function shouldRetryDownload(err) {
  const msg = err && err.errMsg ? err.errMsg : String(err || '')
  return msg.includes('ERR_TIMED_OUT') ||
    msg.includes('timeout') ||
    msg.includes('cronet_error_code:-7') ||
    msg.includes('cronet_error_code:-101') ||
    msg.includes('ERR_CONNECTION_RESET') ||
    msg.includes('ECONNRESET')
}

function downloadFileOnce(url, timeout = 60000) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      timeout,
      success(res) {
        const status = res.statusCode || 0
        if (status >= 200 && status < 300 && res.tempFilePath) {
          resolve(res.tempFilePath)
          return
        }
        reject(new Error(`音频下载失败 ${status}`))
      },
      fail: reject
    })
  })
}

async function downloadFile(url, options = {}) {
  const retries = typeof options.retries === 'number' ? options.retries : 3
  const timeout = options.timeout || 60000
  let lastErr = null
  for (let i = 0; i <= retries; i++) {
    try {
      return await downloadFileOnce(url, timeout)
    } catch (err) {
      lastErr = err
      if (i >= retries || !shouldRetryDownload(err)) break
      await sleep(500 * (i + 1))
    }
  }
  throw lastErr
}

function saveTempFile(tempFilePath) {
  return new Promise((resolve, reject) => {
    wx.saveFile({
      tempFilePath,
      success: res => resolve(res.savedFilePath),
      fail: reject
    })
  })
}

async function trimCache(maxBytes = DEFAULT_MAX_BYTES) {
  const map = loadMap()
  const items = Object.keys(map).map(url => ({ url, ...map[url] }))
  let total = items.reduce((sum, item) => sum + Number(item.size || 0), 0)
  if (total <= maxBytes) return

  items.sort((a, b) => Number(a.lastUsedAt || a.createdAt || 0) - Number(b.lastUsedAt || b.createdAt || 0))
  for (const item of items) {
    if (total <= maxBytes * 0.85) break
    await removeSavedFile(item.savedFilePath)
    total -= Number(item.size || 0)
    delete map[item.url]
  }
  saveMap()
}

async function downloadAndCache(url, options = {}) {
  if (!isRemoteUrl(url)) return url
  const cached = await getCachedFile(url)
  if (cached) return cached
  if (pending[url]) return pending[url]

  pending[url] = (async () => {
    const tempFilePath = await downloadFile(url, options)
    const savedFilePath = await saveTempFile(tempFilePath)
    const info = await getFileInfo(savedFilePath)
    const map = loadMap()
    map[url] = {
      url,
      savedFilePath,
      size: Number(info.size || 0),
      createdAt: now(),
      lastUsedAt: now(),
      tag: options.tag || 'audio'
    }
    saveMap()
    await trimCache(options.maxBytes || DEFAULT_MAX_BYTES)
    return savedFilePath
  })().finally(() => {
    delete pending[url]
  })

  return pending[url]
}

// 兼容旧调用名。
function downloadAudio(url, options) {
  return downloadAndCache(url, options)
}

async function removeCachedFile(url) {
  const map = loadMap()
  const item = map[url]
  if (item && item.savedFilePath) await removeSavedFile(item.savedFilePath)
  delete map[url]
  saveMap()
}

async function clearCache() {
  const map = loadMap()
  const urls = Object.keys(map)
  for (const url of urls) {
    if (map[url] && map[url].savedFilePath) await removeSavedFile(map[url].savedFilePath)
  }
  cacheMap = {}
  saveMap()
}

module.exports = {
  downloadAudio,
  downloadAndCache,
  getCachedFile,
  removeCachedFile,
  clearCache,
  trimCache,
  isRemoteUrl
}
