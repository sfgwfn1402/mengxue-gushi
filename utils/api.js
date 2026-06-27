// utils/api.js
const config = require('./config')

function getToken() {
  return wx.getStorageSync('apiToken') || ''
}

function setToken(token) {
  wx.setStorageSync('apiToken', token || '')
}

function clearAuth() {
  wx.removeStorageSync('apiToken')
  wx.removeStorageSync('apiUser')
}

function isUnauthorizedError(err) {
  const msg = err && err.message ? err.message : ''
  return msg.includes('401') || msg.includes('unauthorized') || msg.includes('user not found')
}

function isTransientNetworkError(err) {
  const msg = err && err.errMsg ? err.errMsg : String((err && err.message) || err || '')
  return msg.includes('timeout') ||
    msg.includes('ERR_CONNECTION_RESET') ||
    msg.includes('ERR_TIMED_OUT') ||
    msg.includes('ECONNRESET') ||
    msg.includes('cronet_error_code:-101') ||
    msg.includes('cronet_error_code:-7')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const requestQueue = []
let activeRequestCount = 0
const MAX_CONCURRENT_REQUESTS = 4

function runQueuedRequest(task) {
  activeRequestCount += 1
  task()
    .catch(() => {})
    .then(() => {
      activeRequestCount = Math.max(0, activeRequestCount - 1)
      const next = requestQueue.shift()
      if (next) runQueuedRequest(next)
    })
}

function enqueueRequest(task) {
  return new Promise((resolve, reject) => {
    const wrapped = () => task().then(resolve).catch(reject)
    if (activeRequestCount < MAX_CONCURRENT_REQUESTS) {
      runQueuedRequest(wrapped)
    } else {
      requestQueue.push(wrapped)
    }
  })
}

function requestOnce(options, headers) {
  return enqueueRequest(() => new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${options.url}`,
      method: options.method || 'GET',
      data: options.data || {},
      header: headers,
      timeout: options.timeout || 45000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }

        const message = (res.data && res.data.message) || `HTTP ${res.statusCode}`
        const error = new Error(message)
        error.statusCode = res.statusCode
        reject(error)
      },
      fail: reject
    })
  }))
}

function request(options) {
  const token = getToken()
  const headers = Object.assign({}, options.header || {})

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const retries = options.retries === undefined ? 2 : options.retries
  const attempt = index => requestOnce(options, headers).catch(err => {
    if (index >= retries || !isTransientNetworkError(err)) throw err
    return sleep(350 * (index + 1)).then(() => attempt(index + 1))
  })

  return attempt(0)
}

function toQuery(params) {
  const pairs = []
  Object.keys(params || {}).forEach(key => {
    const value = params[key]
    if (value === undefined || value === null || value === '') return
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  })
  return pairs.length ? `?${pairs.join('&')}` : ''
}

function normalizeMediaUrl(url) {
  if (!url) return ''
  const value = String(url)
  const mediaBase = (config.mediaBaseUrl || '').replace(/\/$/, '')
  if (!mediaBase) return value

  // 线上后端历史数据里可能仍保存 MinIO/IP 地址：
  // http://192.144.133.222:9000/mengxue-gushi/audios-id/poem-1.mp3
  // http://192.144.133.222:9000/mengxue-gushi/images-id/poem-1.jpg
  // 微信正式环境不能访问 HTTP/IP，这里统一改写到 HTTPS 域名。
  // audios-id 是 MinIO 中的真人朗读音频；公网统一走 /audios/，由 Nginx 映射到 MinIO audios-id/。
  const rewrites = [
    { marker: '/audios-id/', target: '/audios/' },
    { marker: '/images-id/', target: '/images/' },
    { marker: '/line-audios/', target: '/line-audios/' },
    { marker: '/recitations/', target: '/recitations/' },
    { marker: '/avatars/', target: '/avatars/' },
    { marker: '/artworks/', target: '/artworks/' }
  ]

  for (let i = 0; i < rewrites.length; i++) {
    const item = rewrites[i]
    const index = value.indexOf(item.marker)
    if (index !== -1) {
      return `${mediaBase}${item.target}${value.slice(index + item.marker.length)}`
    }
  }

  return value
}

function normalizePoemFromApi(p) {
  const themes = p.themes || []
  const audioUrl = normalizeMediaUrl(p.audio_url || '')
  return {
    id: p.id,
    title: p.title,
    author: p.author,
    dynasty: p.dynasty,
    content: p.content,
    pinyin: p.pinyin || '',
    annotatedContent: p.annotated_content || [],
    translation: p.translation || '',
    story: p.story || '',
    parentGuide: p.parent_guide || '',
    difficulty: p.difficulty || p.level || 1,
    level: p.level || p.difficulty || 1,
    tags: p.tags || [],
    season: p.season || 'any',
    audio: audioUrl,
    audioVersion: p.audio_version || p.audioVersion || '',
    localAudio: audioUrl,
    imageUrl: normalizeMediaUrl(p.image_url || ''),
    videoAvailable: !!p.video_available,
    cardUnlocked: !!p.card_unlocked,
    followTimings: p.follow_timings || null
  }
}

function normalizeWorkItem(item) {
  if (!item || typeof item !== 'object') return item
  const normalized = Object.assign({}, item)
  if (normalized.audio_url) normalized.audio_url = normalizeMediaUrl(normalized.audio_url)
  if (normalized.audioUrl) normalized.audioUrl = normalizeMediaUrl(normalized.audioUrl)
  if (normalized.image_url) normalized.image_url = normalizeMediaUrl(normalized.image_url)
  if (normalized.imageUrl) normalized.imageUrl = normalizeMediaUrl(normalized.imageUrl)
  if (normalized.avatar_url) normalized.avatar_url = normalizeMediaUrl(normalized.avatar_url)
  if (normalized.avatarUrl) normalized.avatarUrl = normalizeMediaUrl(normalized.avatarUrl)
  return normalized
}

function normalizeWorkList(data) {
  if (!data || typeof data !== 'object') return data
  if (Array.isArray(data)) return data.map(normalizeWorkItem)
  if (Array.isArray(data.items)) {
    return Object.assign({}, data, { items: data.items.map(normalizeWorkItem) })
  }
  return normalizeWorkItem(data)
}

function sanitizeAuthUser(data) {
  if (!data || typeof data !== 'object') return data || {}
  const user = Object.assign({}, data)
  delete user.session_key
  delete user.sessionKey
  return user
}

function devLogin(openid) {
  return request({
    url: '/auth/dev-login',
    method: 'POST',
    data: { openid: openid || 'dev-openid-local' },
    header: { 'Content-Type': 'application/json' }
  }).then(data => {
    const user = sanitizeAuthUser(data)
    setToken(user.token)
    wx.setStorageSync('apiUser', user)
    return user
  })
}

function wechatLogin(code) {
  const invite_from = wx.getStorageSync('pendingInvite') || undefined
  return request({
    url: '/auth/wechat-login',
    method: 'POST',
    data: invite_from ? { code, invite_from } : { code },
    header: { 'Content-Type': 'application/json' }
  }).then(data => {
    const user = sanitizeAuthUser(data)
    setToken(user.token)
    wx.setStorageSync('apiUser', user)
    wx.removeStorageSync('pendingInvite')
    return user
  })
}

function login(force) {
  if (!force && getToken()) return Promise.resolve(wx.getStorageSync('apiUser') || {})

  if (config.useDevLogin) {
    return devLogin(wx.getStorageSync('devOpenid') || 'dev-openid-local')
  }

  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (!res.code) {
          reject(new Error('wx.login 未返回 code'))
          return
        }
        wechatLogin(res.code).then(resolve).catch(reject)
      },
      fail: reject
    })
  })
}

function authed(options) {
  return login().then(() => request(options)).catch(err => {
    if (!isUnauthorizedError(err)) throw err
    clearAuth()
    return login(true).then(() => request(options))
  })
}



function getTodayPoem() {
  return authed({ url: '/home/today-poem' }).then(data => data.item ? normalizePoemFromApi(data.item) : null)
}

function getContinueLearning() {
  return authed({ url: '/home/continue-learning' }).then(data => data.item ? normalizePoemFromApi(data.item) : null)
}

function getHomeRecommendations() {
  return authed({ url: '/home/recommendations' }).then(data => Object.assign({}, data, {
    items: (data.items || []).map(normalizePoemFromApi)
  }))
}

function getPopularRecitations(params) {
  return authed({ url: `/home/popular-recitations${toQuery(params || {})}` }).then(normalizeWorkList)
}

function getHotRecitationPick() {
  return authed({ url: '/home/hot-recitation-pick' }).then(normalizeWorkList)
}

function listThemes() {
  return request({ url: '/themes' })
}

// 首页人气：社区聚合数据（公开，无需登录）
function getCommunityStats() {
  return request({ url: '/home/community-stats' })
}

function listPoems(params) {
  return request({
    url: `/poems${toQuery(Object.assign({ page: 1, page_size: 100 }, params || {}))}`
  }).then(data => Object.assign({}, data, {
    items: (data.items || []).map(normalizePoemFromApi)
  }))
}

// 后端 page_size 上限为 100；需要完整诗词目录的页面用它翻页拉全，
// 避免只取第 1 页导致 100 首之后的诗对用户隐形。
function listAllPoems(params) {
  const pageSize = 100
  const baseParams = Object.assign({}, params || {})
  delete baseParams.page
  delete baseParams.page_size
  const all = []
  const fetchPage = (page) => {
    if (page > 50) return Promise.resolve({ items: all, total: all.length }) // 安全上限，防失控翻页
    return listPoems(Object.assign({}, baseParams, { page, page_size: pageSize })).then(res => {
      const items = res.items || []
      all.push(...items)
      const total = typeof res.total === 'number' ? res.total : all.length
      if (items.length >= pageSize && all.length < total) {
        return fetchPage(page + 1)
      }
      return { items: all, total: typeof res.total === 'number' ? res.total : all.length }
    })
  }
  return fetchPage(1)
}

function getPoem(id) {
  return request({ url: `/poems/${id}` }).then(normalizePoemFromApi)
}




function getFeaturedRecitation(poemId) {
  return authed({
    url: `/poems/${poemId}/recitations/featured`,
    method: 'GET'
  })
}

function listRecitationsTop(poemId, limit = 5) {
  return authed({
    url: `/poems/${poemId}/recitations/top?limit=${limit}`,
    method: 'GET'
  })
}

function uploadRecitation(poemId, filePath, durationSeconds) {
  const doUpload = () => new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${config.apiBaseUrl}/poems/${poemId}/recitations`,
      filePath,
      name: 'file',
      formData: {
        duration_seconds: String(Math.max(1, Math.round(durationSeconds || 1)))
      },
      header: {
        Authorization: `Bearer ${getToken()}`
      },
      success(res) {
        const status = res.statusCode || 0
        let data = res.data
        try {
          data = typeof data === 'string' ? JSON.parse(data) : data
        } catch (err) {
          const error = new Error(`上传响应解析失败 ${status}`)
          error.statusCode = status
          reject(error)
          return
        }
        if (status >= 200 && status < 300) {
          resolve(data)
          return
        }
        const error = new Error((data && data.message) || `上传失败 ${status}`)
        error.statusCode = status
        reject(error)
      },
      fail: reject
    })
  })

  return login()
    .then(doUpload)
    .catch(err => {
      if (!isUnauthorizedError(err)) throw err
      clearAuth()
      return login(true).then(doUpload)
    })
}

// AI 朗诵评分：上传录音到后端，后端转 FunASR 评分服务，返回字准确率结果。
function scoreRecitation(poemId, filePath) {
  const doUpload = () => new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${config.apiBaseUrl}/poems/${poemId}/recitations/score`,
      filePath,
      name: 'file',
      timeout: 60000, // 冷启含模型加载可能数十秒
      header: { Authorization: `Bearer ${getToken()}` },
      success(res) {
        const status = res.statusCode || 0
        let data = res.data
        try {
          data = typeof data === 'string' ? JSON.parse(data) : data
        } catch (err) {
          const error = new Error(`评分响应解析失败 ${status}`)
          error.statusCode = status
          reject(error)
          return
        }
        if (status >= 200 && status < 300) {
          resolve(data)
          return
        }
        const error = new Error((data && data.message) || `评分失败 ${status}`)
        error.statusCode = status
        reject(error)
      },
      fail: reject
    })
  })

  return login()
    .then(doUpload)
    .catch(err => {
      if (!isUnauthorizedError(err)) throw err
      clearAuth()
      return login(true).then(doUpload)
    })
}

function uploadArtwork(poemId, filePath, payload) {
  const doUpload = () => new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${config.apiBaseUrl}/poems/${poemId}/artworks`,
      filePath,
      name: 'file',
      formData: {
        title: (payload && payload.title) || '我的诗配画',
        description: (payload && payload.description) || ''
      },
      header: { Authorization: `Bearer ${getToken()}` },
      timeout: 30000,
      success(res) {
        const status = res.statusCode || 0
        let data = res.data
        try {
          data = typeof data === 'string' ? JSON.parse(data) : data
        } catch (err) {
          reject(new Error(`上传响应解析失败 ${status}`))
          return
        }
        if (status >= 200 && status < 300) {
          resolve(data)
          return
        }
        reject(new Error((data && data.message) || `上传失败 ${status}`))
      },
      fail: reject
    })
  })

  return login()
    .then(doUpload)
    .catch(err => {
      if (!isUnauthorizedError(err)) throw err
      clearAuth()
      return login(true).then(doUpload)
    })
}

function listArtworks(params) {
  return authed({ url: `/artworks${toQuery(params || {})}` }).then(normalizeWorkList)
}

function absMediaUrl(u) {
  if (!u) return ''
  const s = String(u)
  if (/^https?:\/\//.test(s)) return s
  // 相对路径(如 /api/moments/.../image/0)补成绝对域名，<image> 才能加载
  const base = (config.mediaBaseUrl || '').replace(/\/$/, '')
  return s.charAt(0) === '/' ? base + s : s
}

function normalizeMoment(m) {
  if (!m || typeof m !== 'object') return m
  const out = Object.assign({}, m)
  if (out.image_url) out.image_url = absMediaUrl(out.image_url)
  if (Array.isArray(out.images)) out.images = out.images.map(absMediaUrl)
  if (out.avatar_url) out.avatar_url = normalizeMediaUrl(out.avatar_url)
  return out
}

function listMoments(params) {
  return authed({ url: `/moments${toQuery(params || {})}` })
    .then(data => ({ items: (data.items || []).map(normalizeMoment) }))
}

function listMyMoments() {
  return authed({ url: '/moments/mine' })
    .then(data => ({ items: (data.items || []).map(normalizeMoment) }))
}

function uploadMomentImage(filePath) {
  const doUpload = () => new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${config.apiBaseUrl}/moments/upload-image`,
      filePath,
      name: 'file',
      header: { Authorization: `Bearer ${getToken()}` },
      timeout: 30000,
      success(res) {
        const status = res.statusCode || 0
        let data = res.data
        try { data = typeof data === 'string' ? JSON.parse(data) : data } catch (e) {
          reject(new Error(`上传响应解析失败 ${status}`)); return
        }
        if (status >= 200 && status < 300) { resolve(data && data.object_path); return }
        reject(new Error((data && data.message) || `上传失败 ${status}`))
      },
      fail: reject
    })
  })
  return login().then(doUpload).catch(err => {
    if (!isUnauthorizedError(err)) throw err
    clearAuth()
    return login(true).then(doUpload)
  })
}

function postMoment(objectPaths, content) {
  return authed({
    url: '/moments', method: 'POST',
    data: { content: content || '', object_paths: objectPaths || [] },
    header: { 'Content-Type': 'application/json' }
  })
}

function likeMoment(id) {
  return authed({ url: `/moments/${id}/like`, method: 'POST' })
}
function unlikeMoment(id) {
  return authed({ url: `/moments/${id}/like`, method: 'DELETE' })
}
function deleteMoment(id) {
  return authed({ url: `/moments/${id}`, method: 'DELETE' })
}
function listAdminMoments(params) {
  return authed({ url: `/admin/moments${toQuery(params || {})}` })
    .then(data => ({ total: data.total || 0, items: (data.items || []).map(normalizeMoment) }))
}
function reviewMoment(id, status) {
  return authed({
    url: `/admin/moments/${id}/review`, method: 'POST',
    data: { status }, header: { 'Content-Type': 'application/json' }
  })
}

function listMyRecitations(params) {
  return authed({ url: `/me/recitations${toQuery(params || {})}` }).then(normalizeWorkList)
}

function requireId(id, label) {
  if (id === undefined || id === null || String(id).trim() === '') {
    return Promise.reject(new Error(`${label || 'id'} is required`))
  }
  return String(id).trim()
}

function getRecitation(recitationId) {
  const id = requireId(recitationId, 'recitationId')
  if (typeof id !== 'string') return id
  return authed({ url: `/recitations/${encodeURIComponent(id)}` }).then(normalizeWorkItem)
}

function getArtwork(artworkId) {
  const id = requireId(artworkId, 'artworkId')
  if (typeof id !== 'string') return id
  return authed({ url: `/artworks/${encodeURIComponent(id)}` }).then(normalizeWorkItem)
}

function getWorkQrcodeUrl(type, id) {
  return `${config.apiBaseUrl}/works/qrcode?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`
}

function submitRecitation(recitationId) {
  const id = requireId(recitationId, 'recitationId')
  if (typeof id !== 'string') return id
  return authed({ url: `/recitations/${encodeURIComponent(id)}/submit`, method: 'POST' })
}

function withdrawRecitation(recitationId) {
  const id = requireId(recitationId, 'recitationId')
  if (typeof id !== 'string') return id
  return authed({ url: `/recitations/${encodeURIComponent(id)}/submit`, method: 'DELETE' })
}

function submitArtwork(artworkId) {
  const id = requireId(artworkId, 'artworkId')
  if (typeof id !== 'string') return id
  return authed({ url: `/artworks/${encodeURIComponent(id)}/submit`, method: 'POST' })
}

function withdrawArtwork(artworkId) {
  const id = requireId(artworkId, 'artworkId')
  if (typeof id !== 'string') return id
  return authed({ url: `/artworks/${encodeURIComponent(id)}/submit`, method: 'DELETE' })
}

function deleteRecitation(recitationId) {
  const id = requireId(recitationId, 'recitationId')
  if (typeof id !== 'string') return id
  return authed({ url: `/recitations/${encodeURIComponent(id)}`, method: 'DELETE' })
}

function deleteArtwork(artworkId) {
  const id = requireId(artworkId, 'artworkId')
  if (typeof id !== 'string') return id
  return authed({ url: `/artworks/${encodeURIComponent(id)}`, method: 'DELETE' })
}

function likeArtwork(artworkId) {
  const id = requireId(artworkId, 'artworkId')
  if (typeof id !== 'string') return id
  return authed({ url: `/artworks/${encodeURIComponent(id)}/like`, method: 'POST' })
}

function unlikeArtwork(artworkId) {
  const id = requireId(artworkId, 'artworkId')
  if (typeof id !== 'string') return id
  return authed({ url: `/artworks/${encodeURIComponent(id)}/like`, method: 'DELETE' })
}

function likeRecitation(recitationId) {
  const id = requireId(recitationId, 'recitationId')
  if (typeof id !== 'string') return id
  return authed({
    url: `/recitations/${encodeURIComponent(id)}/like`,
    method: 'POST'
  })
}

function unlikeRecitation(recitationId) {
  const id = requireId(recitationId, 'recitationId')
  if (typeof id !== 'string') return id
  return authed({
    url: `/recitations/${encodeURIComponent(id)}/like`,
    method: 'DELETE'
  })
}

function getMe() {
  return authed({ url: '/me' })
}

function updateProfile(payload) {
  return authed({
    url: '/me',
    method: 'POST',
    data: payload || {},
    header: { 'Content-Type': 'application/json' }
  })
}

function uploadAvatar(filePath) {
  return login().then(() => new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${config.apiBaseUrl}/me/avatar`,
      filePath,
      name: 'file',
      header: { Authorization: `Bearer ${getToken()}` },
      timeout: 30000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(res.data || '{}'))
          } catch (err) {
            reject(err)
          }
          return
        }
        reject(new Error(`HTTP ${res.statusCode}`))
      },
      fail: reject
    })
  }))
}

function getStats() {
  return authed({ url: '/me/stats' })
}

function checkin() {
  return authed({ url: '/me/checkin', method: 'POST' })
}

// 用户授权学习提醒订阅一次 → 后端额度 +1
function subscribeReminder() {
  return authed({ url: '/me/reminder-subscribe', method: 'POST' })
}

function getInviteInfo() {
  return authed({ url: '/me/invite-info' })
}

function getInviter(code) {
  // 公开接口，无需登录态
  return request({ url: `/invite/inviter/${encodeURIComponent(code)}` })
}

function trackEvents(events) {
  // 埋点上报：不重试、带 token 即记 user_id，失败静默
  return request({
    url: '/events',
    method: 'POST',
    data: { events: events || [] },
    header: { 'Content-Type': 'application/json' },
    retries: 0
  })
}

function getAnalytics(days) {
  return authed({ url: `/admin/analytics${toQuery({ days })}` })
}

function completeTask(taskId, stars) {
  return authed({
    url: '/me/tasks',
    method: 'POST',
    data: { task_id: taskId, stars: stars || 0 },
    header: { 'Content-Type': 'application/json' }
  })
}

function clearUserData() {
  return authed({ url: '/me/clear-data', method: 'POST' })
}

function listProgress() {
  return authed({ url: '/me/progress' }).then(data => Array.isArray(data) ? data : (data.items || []))
}

function updateProgress(poemId, payload) {
  return authed({
    url: `/me/progress/${poemId}`,
    method: 'POST',
    data: payload || {},
    header: { 'Content-Type': 'application/json' }
  })
}

function listIdiomProgress() {
  return authed({ url: '/me/idiom-progress' })
}

function updateIdiomProgress(payload) {
  return authed({
    url: '/me/idiom-progress',
    method: 'POST',
    data: payload || {},
    header: { 'Content-Type': 'application/json' }
  })
}

function listFavorites() {
  return authed({ url: '/me/favorites' }).then(data => Object.assign({}, data, {
    items: (data.items || []).map(normalizePoemFromApi)
  }))
}

function addFavorite(poemId) {
  return authed({ url: `/me/favorites/${poemId}`, method: 'POST' })
}

function removeFavorite(poemId) {
  return authed({ url: `/me/favorites/${poemId}`, method: 'DELETE' })
}

function submitParentFeedback(payload) {
  return authed({
    url: '/feedback',
    method: 'POST',
    data: payload || {},
    header: { 'Content-Type': 'application/json' }
  })
}

function listAdminFeedback(params) {
  return authed({ url: `/admin/feedback${toQuery(params || {})}` })
}

function updateAdminFeedbackStatus(id, payload) {
  return authed({
    url: `/admin/feedback/${id}/status`,
    method: 'POST',
    data: payload || {},
    header: { 'Content-Type': 'application/json' }
  })
}

function listAdminRecitations(params) {
  return authed({ url: `/admin/recitations${toQuery(params || {})}` }).then(normalizeWorkList)
}

function reviewRecitation(recitationId, status) {
  const id = requireId(recitationId, 'recitationId')
  if (typeof id !== 'string') return id
  return authed({
    url: `/admin/recitations/${encodeURIComponent(id)}/review`,
    method: 'POST',
    data: { status },
    header: { 'Content-Type': 'application/json' }
  })
}

function listAdminArtworks(params) {
  return authed({ url: `/admin/artworks${toQuery(params || {})}` }).then(normalizeWorkList)
}

function reviewArtwork(artworkId, status) {
  const id = requireId(artworkId, 'artworkId')
  if (typeof id !== 'string') return id
  return authed({
    url: `/admin/artworks/${encodeURIComponent(id)}/review`,
    method: 'POST',
    data: { status },
    header: { 'Content-Type': 'application/json' }
  })
}

module.exports = {
  config,
  request,
  getToken,
  clearAuth,
  setToken,
  login,
  devLogin,
  wechatLogin,
  getTodayPoem,
  getContinueLearning,
  getHomeRecommendations,
  getPopularRecitations,
  getHotRecitationPick,
  listThemes,
  getCommunityStats,
  listPoems,
  listAllPoems,
  getPoem,
  getFeaturedRecitation,
  listRecitationsTop,
  uploadRecitation,
  scoreRecitation,
  uploadArtwork,
  listArtworks,
  listMoments,
  listMyMoments,
  uploadMomentImage,
  postMoment,
  likeMoment,
  unlikeMoment,
  deleteMoment,
  listAdminMoments,
  reviewMoment,
  listMyRecitations,
  getRecitation,
  getArtwork,
  getWorkQrcodeUrl,
  submitRecitation,
  withdrawRecitation,
  submitArtwork,
  withdrawArtwork,
  deleteRecitation,
  deleteArtwork,
  likeArtwork,
  unlikeArtwork,
  likeRecitation,
  unlikeRecitation,
  getMe,
  updateProfile,
  uploadAvatar,
  getStats,
  checkin,
  subscribeReminder,
  getInviteInfo,
  getInviter,
  trackEvents,
  getAnalytics,
  completeTask,
  clearUserData,
  listProgress,
  updateProgress,
  listIdiomProgress,
  updateIdiomProgress,
  listFavorites,
  addFavorite,
  removeFavorite,
  submitParentFeedback,
  listAdminFeedback,
  updateAdminFeedbackStatus,
  listAdminRecitations,
  reviewRecitation,
  listAdminArtworks,
  reviewArtwork,
  normalizePoemFromApi
}
