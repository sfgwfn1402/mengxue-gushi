// pages/game-match/game-match.js - 诗句配对：把诗句和它的题目连起来
const app = getApp()
const api = require('../../utils/api')
const { track } = require('../../utils/track')

const PAIRS = 4
const ROUNDS = 5

function firstLine(content) {
  const parts = String(content || '').split(/[，。！？、；\n]/).map(s => s.trim()).filter(s => s.length >= 3)
  return parts[0] || ''
}
function shuffle(a) {
  const arr = a.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

Page({
  data: {
    left: [],          // [{ pid, text }]
    right: [],         // [{ pid, title }]
    selectedLeft: -1,  // index in left
    matched: {},       // pid -> true
    wrongLeft: -1,
    wrongRight: -1,
    round: 0,
    total: ROUNDS,
    finished: false
  },

  onLoad() {
    const poems = (app.getPoems && app.getPoems()) || []
    if (poems.length) {
      this.prepare(poems)
    } else {
      api.listAllPoems().then(res => {
        const items = res.items || []
        if (app.globalData) app.globalData.poems = items
        this.prepare(items)
      }).catch(() => this.prepare([]))
    }
  },

  prepare(poems) {
    this._pool = (poems || []).filter(p => p && p.content && firstLine(p.content) && p.title)
    if (this._pool.length < PAIRS) { this.setData({ finished: true }); return }
    track('game_start', { game: 'match' })
    this.newRound()
  },

  newRound() {
    if (this.data.round >= ROUNDS) { this.finish(); return }
    const picks = shuffle(this._pool).slice(0, PAIRS)
    const left = picks.map(p => ({ pid: p.id, text: firstLine(p.content) }))
    const right = shuffle(picks.map(p => ({ pid: p.id, title: p.title })))
    this.setData({
      left, right, matched: {}, selectedLeft: -1,
      wrongLeft: -1, wrongRight: -1,
      round: this.data.round + 1
    })
  },

  tapLeft(e) {
    const i = Number(e.currentTarget.dataset.index)
    if (this.data.matched[this.data.left[i].pid]) return
    this.setData({ selectedLeft: i, wrongLeft: -1, wrongRight: -1 })
  },

  tapRight(e) {
    const j = Number(e.currentTarget.dataset.index)
    const li = this.data.selectedLeft
    if (li < 0) return
    if (this.data.matched[this.data.right[j].pid]) return
    const leftPid = this.data.left[li].pid
    const rightPid = this.data.right[j].pid
    if (leftPid === rightPid) {
      const matched = Object.assign({}, this.data.matched)
      matched[leftPid] = true
      this.setData({ matched, selectedLeft: -1 })
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail: () => {} })
      if (Object.keys(matched).length >= PAIRS) {
        setTimeout(() => this.newRound(), 700)
      }
    } else {
      this.setData({ wrongLeft: li, wrongRight: j })
      if (wx.vibrateShort) wx.vibrateShort({ type: 'medium', fail: () => {} })
      setTimeout(() => this.setData({ wrongLeft: -1, wrongRight: -1, selectedLeft: -1 }), 500)
    }
  },

  finish() {
    this.setData({ finished: true })
    track('game_finish', { game: 'match', total: ROUNDS })
  },

  restart() {
    this.setData({ round: 0, finished: false })
    this.newRound()
  },

  onShareAppMessage() {
    return {
      title: '我在萌学古诗玩“诗句配对”，你也来连一连！',
      path: '/pages/game/game'
    }
  }
})
