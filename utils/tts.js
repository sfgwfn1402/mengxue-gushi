// utils/tts.js
// 诗词整首朗读音频不打包进小程序，统一走 HTTPS 域名。
// 公开标准音频由 Nginx 直接反代 MinIO：/audios/ -> MinIO audios-id/。
// 跟读单句音频在 pages/learn/learn.js 中单独走 /line-audios/。
const config = require('./config')
const MINIO_BASE_URL = config.minioBaseUrl
const MEDIA_BASE_URL = config.mediaBaseUrl || config.minioBaseUrl

const FALLBACK_POEM_AUDIO_VERSION = {
  // id=8《游子吟》正文已补齐为六句；复用 id=74 的完整六句官方朗读，避免线上 poem-8 旧四句音频缓存。
  8: '20260621-full6',
  33: '20260621-real-guwendao-funasr-v9',
  38: '20260621-pipaxing-bai-guwendao-p38_58_30',
  39: '20260621-bingchexing-excerpt-funasr-v4-tail'
}

const POEM_AUDIO_ID_ALIAS = {
  8: 74
}

// 文本已齐全、但真人朗读/跟读音频尚未生成的诗（id 172~177，比 seed 多出的 6 首新诗）。
// 音频补齐并上传 MinIO 后，从这里移除对应 id 即可恢复朗读/跟读入口。
const POEM_AUDIO_PENDING = new Set([172, 173, 174, 175, 176, 177])

function isPoemAudioPending(poem) {
  return !!poem && POEM_AUDIO_PENDING.has(Number(poem.id))
}

function getRemotePoemAudioPath(poem) {
  if (!poem || !poem.id) return ''
  if (isPoemAudioPending(poem)) return '' // 音频整理中，不给候选 URL，避免 404 哑播
  // 官方朗读使用 MinIO 中的真人音频；公网短路径 /audios/ 由 Nginx 映射到 MinIO audios-id/。
  // 长期方案：后端返回 audio_version；小程序把它拼到 URL 上，音频更新后自动绕过本地缓存。
  const poemId = Number(poem.id)
  const audioId = POEM_AUDIO_ID_ALIAS[poemId] || poemId
  const version = poem.audioVersion || poem.audio_version || FALLBACK_POEM_AUDIO_VERSION[poemId]
  return `${MEDIA_BASE_URL}/audios/poem-${audioId}.mp3${version ? `?v=${version}` : ''}`
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
  isPoemAudioPending,
  audioExists,
  pickAvailableAudio
}
