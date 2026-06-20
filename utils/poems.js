const level1 = require('../data/poems-level1')
const level2 = require('../data/poems-level2')
const level3 = require('../data/poems-level3')

const audioMap = {
  1: '/audios/poem-1.mp3',
  2: '/audios/poem-2.mp3',
  3: '/audios/poem-3.mp3',
  4: '/audios/poem-4.mp3',
  5: '/audios/poem-5.mp3',
  6: '/audios/poem-6.mp3',
  7: '/audios/poem-7.mp3',
  8: '/audios/poem-8.mp3',
  9: '/audios/poem-9.mp3',
  10: '/audios/poem-10.mp3',
  11: '/audios/poem-11.mp3',
  12: '/audios/poem-12.mp3',
  13: '/audios/poem-13.mp3',
  14: '/audios/poem-14.mp3',
  15: '/audios/poem-15.mp3',
  16: '/audios/poem-16.mp3',
  17: '/audios/poem-17.mp3',
  18: '/audios/poem-18.mp3',
  19: '/audios/poem-19.mp3',
  20: '/audios/poem-20.mp3',
  21: '/audios/poem-21.mp3',
  22: '/audios/poem-22.mp3',
  23: '/audios/poem-23.mp3',
  24: '/audios/poem-24.mp3',
  25: '/audios/poem-25.mp3',
  26: '/audios/poem-26.mp3',
  27: '/audios/poem-27.mp3',
  28: '/audios/poem-28.mp3',
  29: '/audios/poem-29.mp3',
  30: '/audios/poem-30.mp3',
  31: '/audios/poem-31.mp3',
  32: '/audios/poem-32.mp3',
  33: '/audios/poem-33.mp3',
  34: '/audios/poem-34.mp3',
  35: '/audios/poem-35.mp3',
  36: '/audios/poem-36.mp3',
  37: '/audios/poem-37.mp3',
  38: '/audios/poem-38.mp3',
  39: '/audios/poem-39.mp3',
  40: '/audios/poem-40.mp3',
  41: '/audios/poem-41.mp3',
  42: '/audios/poem-42.mp3',
  43: '/audios/poem-43.mp3',
  44: '/audios/poem-44.mp3',
  45: '/audios/poem-45.mp3',
  46: '/audios/poem-46.mp3',
  47: '/audios/poem-47.mp3',
  48: '/audios/poem-48.mp3',
  49: '/audios/poem-49.mp3',
  50: '/audios/poem-50.mp3'
}

function normalizePoem(p) {
  return {
    id: p.id,
    title: p.title,
    author: p.author,
    dynasty: p.dynasty,
    content: p.content,
    pinyin: p.pinyin,
    annotatedContent: p.annotatedContent || [],
    translation: p.translation,
    story: p.story,
    parentGuide: p.parentGuide || '',
    difficulty: p.difficulty,
    tags: p.tags || [],
    season: p.season || 'any',
    audio: p.audio || audioMap[p.id] || '',
    audioVersion: p.audioVersion || p.audio_version || '',
    localAudio: audioMap[p.id] || '',
    videoAvailable: !!p.videoAvailable,
    cardUnlocked: !!p.cardUnlocked
  }
}

function loadAllPoems() {
  const seen = {}
  const list = []
  const sources = [level1.poems, level2.poems, level3.poems]

  for (let s = 0; s < sources.length; s++) {
    const poems = sources[s] || []
    for (let i = 0; i < poems.length; i++) {
      const p = poems[i]
      if (!p || seen[p.id]) continue
      seen[p.id] = true
      list.push(normalizePoem(p))
    }
  }

  list.sort(function (a, b) {
    return a.id - b.id
  })
  return list
}

module.exports = { loadAllPoems }
