// pages/game-feihua/game-feihua.js - 飞花令：给一个「令字」，从4句里找出含它的诗句
const app = getApp()
const api = require('../../utils/api')
const { track } = require('../../utils/track')

// 常见、孩子熟悉、在多首诗里出现的令字
const LING_POOL = ['月', '花', '山', '水', '风', '春', '日', '雨', '云', '天', '江', '草', '鸟', '人', '夜', '白', '红', '青', '心', '家']
const TOTAL_ROUNDS = 8

function splitLines(content) {
  return String(content || '').split(/[，。！？、；\n]/).map(s => s.trim()).filter(s => s.length >= 3)
}
function shuffle(a) {
  const arr = a.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
function rnd(n) { return Math.floor(Math.random() * n) }

Page({
  data: {
    ling: '',
    options: [],
    answerIndex: -1,
    selected: -1,
    isCorrect: null,
    round: 0,
    total: TOTAL_ROUNDS,
    score: 0,
    finished: false,
    locked: false
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
    // 所有诗句池
    const lines = []
    ;(poems || []).forEach(p => {
      splitLines(p.content).forEach(text => lines.push({ text, poem: p.title }))
    })
    this._lines = lines
    if (!lines.length) { this.setData({ finished: true }); return }
    // 可用令字：池里有诗句含它、也有足够不含它的
    this._lings = LING_POOL.filter(ch => {
      const has = lines.filter(l => l.text.indexOf(ch) >= 0).length
      return has >= 1 && lines.length - has >= 3
    })
    track('game_start', { game: 'feihua' })
    this.nextRound()
  },

  nextRound() {
    if (this.data.round >= TOTAL_ROUNDS) { this.finish(); return }
    const lings = this._lings || []
    const lines = this._lines || []
    if (!lings.length) { this.finish(); return }
    const ling = lings[rnd(lings.length) % lings.length] || lings[0]
    const withChar = lines.filter(l => l.text.indexOf(ling) >= 0)
    const without = lines.filter(l => l.text.indexOf(ling) < 0)
    const correct = withChar[rnd(withChar.length) % withChar.length]
    const distract = shuffle(without).slice(0, 3)
    const opts = shuffle([correct].concat(distract))
    const answerIndex = opts.findIndex(o => o === correct)
    this.setData({
      ling,
      options: opts.map(o => o.text),
      answerIndex,
      selected: -1,
      isCorrect: null,
      locked: false,
      round: this.data.round + 1
    })
  },

  choose(e) {
    if (this.data.locked) return
    const i = Number(e.currentTarget.dataset.index)
    const ok = i === this.data.answerIndex
    this.setData({ selected: i, isCorrect: ok, locked: true, score: this.data.score + (ok ? 1 : 0) })
    if (wx.vibrateShort) wx.vibrateShort({ type: ok ? 'light' : 'medium', fail: () => {} })
    setTimeout(() => this.nextRound(), 1100)
  },

  finish() {
    this.setData({ finished: true })
    track('game_finish', { game: 'feihua', score: this.data.score, total: TOTAL_ROUNDS })
  },

  restart() {
    this.setData({ round: 0, score: 0, finished: false })
    this.nextRound()
  },

  onShareAppMessage() {
    return {
      title: `我在萌学古诗玩飞花令，答对了 ${this.data.score}/${TOTAL_ROUNDS} 句，你来试试！`,
      path: '/pages/game/game'
    }
  }
})
