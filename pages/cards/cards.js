// pages/cards/cards.js - 诗词卡片图鉴：学会一首点亮一张收藏卡，按难度分稀有度
const app = getApp()
const api = require('../../utils/api')
const { getPoemImageUrl } = require('../../utils/tts')
const { track } = require('../../utils/track')

const RARITY = {
  1: { key: 'common', label: '普通' },
  2: { key: 'rare', label: '稀有' },
  3: { key: 'epic', label: '史诗' }
}

function rarityOf(poem) {
  const lv = Number(poem.level || poem.difficulty) || 1
  return RARITY[lv] || RARITY[1]
}
function splitLines(content) {
  return String(content || '').split(/[，。！？、；\n]/).map(s => s.trim()).filter(Boolean)
}

Page({
  data: {
    filter: 'all',       // all / unlocked / locked
    cards: [],
    visible: [],
    total: 0,
    unlockedCount: 0,
    detail: null,
    detailLocked: false
  },

  onLoad() {
    this.ensurePoems().then(poems => this.loadProgressThenBuild(poems))
  },

  onShow() {
    // 学完一首回来即时点亮
    if (this._poems) this.loadProgressThenBuild(this._poems)
  },

  ensurePoems() {
    const poems = (app.getPoems && app.getPoems()) || []
    if (poems.length) { this._poems = poems; return Promise.resolve(poems) }
    return api.listAllPoems().then(res => {
      const items = res.items || []
      if (app.globalData) app.globalData.poems = items
      this._poems = items
      return items
    }).catch(() => { this._poems = []; return [] })
  },

  loadProgressThenBuild(poems) {
    api.listProgress()
      .then(items => {
        const list = Array.isArray(items) ? items : (items.items || [])
        const learned = new Set(list.filter(it => it.learned).map(it => Number(it.poem_id != null ? it.poem_id : it.poemId)))
        this.buildCards(poems, learned)
      })
      .catch(() => this.buildCards(poems, new Set()))
  },

  buildCards(poems, learnedSet) {
    const cards = (poems || []).slice().sort((a, b) => a.id - b.id).map(p => {
      const r = rarityOf(p)
      return {
        id: p.id,
        title: p.title,
        author: p.author || '',
        dynasty: p.dynasty || '',
        cover: getPoemImageUrl(p.id),
        rarity: r.key,
        rarityLabel: r.label,
        unlocked: learnedSet.has(Number(p.id)),
        lines: splitLines(p.content),
        story: p.story || ''
      }
    })
    const unlockedCount = cards.filter(c => c.unlocked).length
    this.setData({
      cards,
      total: cards.length,
      unlockedCount,
      visible: this.applyFilter(cards, this.data.filter)
    })
    track('cards_open', { unlocked: unlockedCount, total: cards.length })
  },

  applyFilter(cards, filter) {
    if (filter === 'unlocked') return cards.filter(c => c.unlocked)
    if (filter === 'locked') return cards.filter(c => !c.unlocked)
    return cards
  },

  switchFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ filter, visible: this.applyFilter(this.data.cards, filter) })
  },

  openCard(e) {
    const id = Number(e.currentTarget.dataset.id)
    const card = this.data.cards.find(c => c.id === id)
    if (!card) return
    this.setData({ detail: card, detailLocked: !card.unlocked })
    track('card_detail', { poem_id: id, unlocked: card.unlocked })
  },

  closeDetail() {
    this.setData({ detail: null })
  },

  goLearnDetail() {
    const c = this.data.detail
    if (c) wx.navigateTo({ url: `/pages/learn/learn?id=${c.id}&type=poem` })
  },

  goStoryDetail() {
    const c = this.data.detail
    if (c) wx.navigateTo({ url: `/pages/story/story?id=${c.id}` })
  },

  noop() {},

  onShareAppMessage() {
    return {
      title: `我在萌学古诗集了 ${this.data.unlockedCount} 张古诗卡，你也来集卡！`,
      path: '/pages/index/index'
    }
  }
})
