// pages/story/story.js - 诗词故事（绘本式）：诗人故事 + 画面译文 + 听一听 + 翻页浏览
const app = getApp()
const api = require('../../utils/api')
const audioManager = require('../../utils/audio-manager')
const { getRemotePoemAudioPath, getPoemImageUrl, isPoemAudioPending } = require('../../utils/tts')
const { track } = require('../../utils/track')

function buildStoryText(poem) {
  const story = (poem && poem.story) ? String(poem.story).trim() : ''
  if (story) return story
  // 没有现成故事时，用作者朝代兜底一句，避免空白
  return `这首《${poem.title}》是${poem.dynasty || ''}代${poem.author || '诗人'}写的。闭上眼睛听一听，想象一下诗里的画面吧。`
}

Page({
  data: {
    poem: null,
    storyText: '',
    lines: [],
    cover: '',
    hasAudio: false,
    playing: false,
    index: 0,
    total: 0
  },

  onLoad(options) {
    this._poems = (app.getPoems && app.getPoems()) || []
    if (!this._poems.length) {
      api.listAllPoems().then(res => {
        this._poems = res.items || []
        if (app.globalData) app.globalData.poems = this._poems
        this.openById(Number(options && options.id))
      }).catch(() => this.openById(Number(options && options.id)))
    } else {
      this.openById(Number(options && options.id))
    }
  },

  openById(id) {
    const poems = this._poems || []
    let idx = poems.findIndex(p => Number(p.id) === Number(id))
    if (idx < 0) idx = 0
    this.showAt(idx)
  },

  showAt(idx) {
    const poems = this._poems || []
    const poem = poems[idx]
    if (!poem) { this.setData({ poem: null }); return }
    this.stopAudio()
    const lines = String(poem.content || '').split(/[，。！？、；\n]/).map(s => s.trim()).filter(Boolean)
    const hasAudio = !isPoemAudioPending(poem) && !!getRemotePoemAudioPath(poem)
    this.setData({
      poem,
      storyText: buildStoryText(poem),
      lines,
      cover: getPoemImageUrl(poem.id),
      hasAudio,
      playing: false,
      index: idx,
      total: poems.length
    })
    wx.setNavigationBarTitle({ title: `${poem.title} 的故事` })
    track('story_view', { poem_id: poem.id })
  },

  prevStory() {
    const i = (this.data.index - 1 + this.data.total) % this.data.total
    this.showAt(i)
  },

  nextStory() {
    const i = (this.data.index + 1) % this.data.total
    this.showAt(i)
  },

  toggleAudio() {
    const poem = this.data.poem
    if (!poem || !this.data.hasAudio) return
    if (this.data.playing && this.audio) {
      this.stopAudio()
      return
    }
    const url = getRemotePoemAudioPath(poem)
    if (!url) return
    this.audio = audioManager.create('story-read')
    this.audio.onEnded(() => this.setData({ playing: false }))
    this.audio.onStop(() => this.setData({ playing: false }))
    this.audio.onError(() => this.setData({ playing: false }))
    this.audio.src = url
    this.setData({ playing: true })
    audioManager.playWithRetry(this.audio, { attempts: 4, delay: 260, shouldContinue: () => this.data.playing })
    track('story_listen', { poem_id: poem.id })
  },

  stopAudio() {
    if (this.audio) {
      try { this.audio.destroy() } catch (e) {}
      this.audio = null
    }
    audioManager.destroy('story-read')
    if (this.data.playing) this.setData({ playing: false })
  },

  goLearn() {
    const poem = this.data.poem
    if (poem) wx.navigateTo({ url: `/pages/learn/learn?id=${poem.id}&type=poem` })
  },

  goRecite() {
    const poem = this.data.poem
    if (poem) wx.navigateTo({ url: `/pages/recite/recite?id=${poem.id}&type=poem` })
  },

  onHide() { this.stopAudio() },
  onUnload() { this.stopAudio() }
})
