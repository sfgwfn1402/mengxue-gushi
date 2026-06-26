// pages/review/review.js - 复习巩固：基于遗忘曲线，把"该复习"的诗拿出来主动回想
const app = getApp()
const api = require('../../utils/api')

const REVIEW_INTERVAL_DAYS = 2   // 学会/上次复习超过这么多天，就该复习
const MAX_CARDS = 12             // 一次复习上限，避免太多
const PUNCT = '，。！？；、,.!?;'

Page({
  data: {
    cards: [],
    index: 0,
    total: 0,
    doneCount: 0,
    loading: true,
    finished: false,
    revealed: false
  },

  onLoad() {
    this.loadDue()
  },

  loadDue() {
    Promise.all([api.listProgress(), api.listAllPoems()])
      .then(([progressRes, poemRes]) => {
        const items = Array.isArray(progressRes) ? progressRes : (progressRes.items || [])
        const poemMap = {}
        ;(poemRes.items || []).forEach(p => { poemMap[Number(p.id)] = p })
        const now = Date.now()
        const due = items
          .filter(it => it.learned && this.daysSince(it.last_learned_at, now) >= REVIEW_INTERVAL_DAYS)
          .sort((a, b) => this.parseTime(a.last_learned_at) - this.parseTime(b.last_learned_at)) // 最久没碰的优先
          .map(it => poemMap[Number(it.poem_id != null ? it.poem_id : it.poemId)])
          .filter(Boolean)
          .slice(0, MAX_CARDS)
          .map(p => ({
            id: p.id,
            title: p.title,
            author: p.author,
            dynasty: p.dynasty,
            lines: this.splitLines(p.content)
          }))
        this.setData({
          cards: due,
          total: due.length,
          index: 0,
          doneCount: 0,
          loading: false,
          finished: due.length === 0,
          revealed: false
        })
      })
      .catch(err => {
        console.warn('读取复习列表失败', err)
        this.setData({ loading: false })
        wx.showToast({ title: '读取失败，请稍后再试', icon: 'none' })
      })
  },

  parseTime(s) {
    if (!s) return 0
    const d = new Date(String(s).replace(' ', 'T') + 'Z') // 后端 UTC 'YYYY-MM-DD HH:MM:SS'
    const t = d.getTime()
    return isNaN(t) ? 0 : t
  },

  daysSince(s, now) {
    const t = this.parseTime(s)
    if (!t) return 999
    return (now - t) / 86400000
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

  reveal() {
    this.setData({ revealed: true })
  },

  // 记住了：复习成功，刷新 last_learned_at（下次按间隔再提醒）
  remembered() {
    const card = this.data.cards[this.data.index]
    if (!card) return
    api.updateProgress(card.id, { learned: true, read_count_delta: 1 })
      .catch(err => console.warn('复习进度同步失败', err))
    this.next()
  },

  reviewAgain() {
    const card = this.data.cards[this.data.index]
    if (card) wx.navigateTo({ url: `/pages/learn/learn?id=${card.id}&type=poem` })
  },

  next() {
    const doneCount = this.data.doneCount + 1
    const index = this.data.index + 1
    if (index >= this.data.total) {
      this.setData({ doneCount, finished: true })
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail: () => {} })
    } else {
      this.setData({ doneCount, index, revealed: false })
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
