// pages/game/game.js - 诗词游戏中心
const { track } = require('../../utils/track')

Page({
  data: {
    games: [
      { key: 'feihua', emoji: '🌸', title: '飞花令', desc: '找出含「令字」的诗句', url: '/pages/game-feihua/game-feihua', tone: 'coral' },
      { key: 'match', emoji: '🔗', title: '诗句配对', desc: '诗句连题目，连连看', url: '/pages/game-match/game-match', tone: 'sky' },
      { key: 'quiz', emoji: '📝', title: '古诗选择题', desc: '填字闯关，答对得诗光', url: '/pages/quiz/quiz?mode=poem', tone: 'mint' }
    ]
  },

  onLoad() {
    track('game_hub_open', {})
  },

  openGame(e) {
    const url = e.currentTarget.dataset.url
    const key = e.currentTarget.dataset.key
    if (!url) return
    track('game_pick', { game: key })
    wx.navigateTo({ url })
  }
})
