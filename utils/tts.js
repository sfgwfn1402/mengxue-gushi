// utils/tts.js
// 诗词整首朗读音频不打包进小程序，统一走 HTTPS 域名。
// 公开标准音频由 Nginx 直接反代 MinIO：/audios/ -> MinIO audios-id/。
// 跟读单句音频在 pages/learn/learn.js 中单独走 /line-audios/。
const config = require('./config')
const MINIO_BASE_URL = config.minioBaseUrl
const MEDIA_BASE_URL = config.mediaBaseUrl || config.minioBaseUrl

const FALLBACK_POEM_AUDIO_VERSION = {
  33: '20260620-real-v4'
}

function getRemotePoemAudioPath(poem) {
  if (!poem || !poem.id) return ''
  // 官方朗读使用 MinIO 中的真人音频；公网短路径 /audios/ 由 Nginx 映射到 MinIO audios-id/。
  // 长期方案：后端返回 audio_version；小程序把它拼到 URL 上，音频更新后自动绕过本地缓存。
  const version = poem.audioVersion || poem.audio_version || FALLBACK_POEM_AUDIO_VERSION[poem.id]
  return `${MEDIA_BASE_URL}/audios/poem-${poem.id}.mp3${version ? `?v=${version}` : ''}`
}

function getPoemAudioCandidates(poem) {
  const remote = getRemotePoemAudioPath(poem)
  return remote ? [remote] : []
}

function getIdiomAudioCandidates(idiom) {
  if (!idiom || !idiom.audio) return []
  return [idiom.audio]
}

function getAudioCandidates(type, item) {
  if (type === 'poem') return getPoemAudioCandidates(item)
  return getIdiomAudioCandidates(item)
}

function getAudioPath(type, item) {
  const candidates = getAudioCandidates(type, item)
  return candidates[0] || ''
}

function audioExists(audioPath) {
  return new Promise((resolve) => {
    if (!audioPath) {
      resolve(false)
      return
    }

    if (/^https?:\/\//.test(audioPath)) {
      // 远程 URL 交给 InnerAudioContext 播放，不做 HEAD 预检；
      // 小程序真机里 HEAD/request 合法域名和 audio 播放链路可能表现不一致。
      resolve(true)
      return
    }

    wx.getFileSystemManager().access({
      path: audioPath,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

async function pickAvailableAudio(candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const path = candidates[i]
    const exists = await audioExists(path)
    if (exists) return path
  }
  return ''
}

module.exports = {
  MINIO_BASE_URL,
  getAudioPath,
  getAudioCandidates,
  getRemotePoemAudioPath,
  audioExists,
  pickAvailableAudio
}
