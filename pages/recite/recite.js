// pages/recite/recite.js - 背诵模式：逐句遮挡、提示首字、看答案、逐句背出
const app = getApp()
const api = require('../../utils/api')
const onboarding = require('../../utils/onboarding')

const PUNCT = '，。！？；、,.!?;'

Page({
  data: {
    poem: null,
    lines: [],          // [{ chars:[{c,punct}], cells:[{t,masked}], done, hintCount, revealAll, isCurrent }]
    currentIndex: 0,
    doneCount: 0,
    total: 0,
    finished: false,
    celebrateVisible: false,
    celebrateTitle: '',
    learnedCount: 0
  },

  onLoad(options) {
    const id = Number(options && options.id)
    if (!id) {
      wx.showToast({ title: '缺少古诗参数', icon: 'none' })
      return
    }
    this.loadPoem(id)
  },

  loadPoem(id) {
    const local = app.getPoemById && app.getPoemById(id)
    if (local && local.content) {
      this.setupPoem(local)
      return
    }
    api.getPoem(id)
      .then(poem => this.setupPoem(poem))
      .catch(err => {
        console.warn('背诵页读取古诗失败', err)
        wx.showToast({ title: '读取失败，请稍后再试', icon: 'none' })
      })
  },

  setupPoem(poem) {
    wx.setNavigationBarTitle({ title: `背诵《${poem.title}》` })
    const rawLines = this.splitLines(poem.content)
    const lines = rawLines.map(text => ({
      chars: [...text].map(c => ({ c, punct: PUNCT.includes(c) })),
      done: false,
      hintCount: 0,
      revealAll: false
    }))
    this.setData({
      poem,
      lines,
      currentIndex: 0,
      doneCount: 0,
      total: lines.length,
      finished: false
    }, () => this.rebuild())
  },

  splitLines(content) {
    const text = Array.isArray(content) ? content.join('') : String(content || '')
    const lines = []
    let buf = ''
    for (const ch of text) {
      buf += ch
      if (PUNCT.includes(ch)) {
        const line = buf.trim()
        if (line) lines.push(line)
        buf = ''
      }
    }
    const tail = buf.trim()
    if (tail) lines.push(tail)
    return lines.length ? lines : [text]
  },

  // 根据每行状态重算遮挡显示
  rebuild() {
    const { lines, currentIndex } = this.data
    const newLines = lines.map((ln, idx) => {
      const isCurrent = idx === currentIndex
      const cells = ln.chars.map((ch, ci) => {
        // 标点始终可见做锚点；已背出/看答案整句可见；当前行按提示数露出前几个字
        let show = ln.done || ln.revealAll || ch.punct
        if (!show && isCurrent && ci < ln.hintCount) show = true
        return { t: show ? ch.c : '', masked: !show }
      })
      return Object.assign({}, ln, { cells, isCurrent })
    })
    this.setData({ lines: newLines })
  },

  hint() {
    const i = this.data.currentIndex
    const lines = this.data.lines.slice()
    if (i >= lines.length || lines[i].done) return
    const cur = lines[i]
    lines[i] = Object.assign({}, cur, { hintCount: Math.min(cur.chars.length, cur.hintCount + 1) })
    this.setData({ lines }, () => this.rebuild())
  },

  reveal() {
    const i = this.data.currentIndex
    const lines = this.data.lines.slice()
    if (i >= lines.length) return
    lines[i] = Object.assign({}, lines[i], { revealAll: true })
    this.setData({ lines }, () => this.rebuild())
  },

  markDone() {
    const i = this.data.currentIndex
    const lines = this.data.lines.slice()
    if (i >= lines.length || lines[i].done) return
    lines[i] = Object.assign({}, lines[i], { done: true })
    const doneCount = this.data.doneCount + 1
    this.setData({ lines, doneCount, currentIndex: i + 1 }, () => {
      this.rebuild()
      if (doneCount >= this.data.total) this.finish()
    })
  },

  restart() {
    const lines = this.data.lines.map(ln => Object.assign({}, ln, { done: false, hintCount: 0, revealAll: false }))
    this.setData({ lines, currentIndex: 0, doneCount: 0, finished: false, celebrateVisible: false }, () => this.rebuild())
  },

  finish() {
    if (this.data.finished) return
    this.setData({ finished: true })
    onboarding.markStep('recite') // 新手引导：背完一首
    const poem = this.data.poem || {}
    // 背完即点亮（与学习页“学会”同一进度口径）
    api.updateProgress(poem.id, { learned: true, read_count_delta: 1 }).catch(err => console.warn('背诵完成同步失败', err))
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail: () => {} })
    api.getStats()
      .then(s => this.showCelebrate(poem.title, s.learned_poem_count || 0))
      .catch(() => this.showCelebrate(poem.title, 0))
  },

  showCelebrate(title, learnedCount) {
    this.setData({ celebrateVisible: true, celebrateTitle: title || '这首诗', learnedCount })
  },

  closeCelebrate() {
    this.setData({ celebrateVisible: false })
  },

  goMyCollection() {
    this.setData({ celebrateVisible: false })
    if (app.globalData) app.globalData.openCollectionOnShow = true
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  noop() {}
})
