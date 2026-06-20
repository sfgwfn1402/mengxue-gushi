// pages/practice/practice.js
const api = require('../../utils/api')

Page({
  data: {
    learnedCount: 0,
    learnedIdiomCount: 0,
    streak: 0
  },

  onShow() {
    this.loadProgress()
  },

  loadProgress() {
    api.getStats()
      .then(stats => {
        this.setData({
          learnedCount: stats.learned_poem_count || 0,
          learnedIdiomCount: stats.learned_idiom_count || 0,
          streak: stats.streak || 0
        })
      })
      .catch(err => {
        console.warn('读取练习统计失败', err)
        wx.showToast({ title: '服务维护中', icon: 'none' })
      })
  },

  startPoemQuiz() {
    wx.navigateTo({
      url: '/pages/quiz/quiz?mode=poem'
    })
  },

  startIdiomQuiz() {
    wx.navigateTo({
      url: '/pages/quiz/quiz?mode=idiom'
    })
  },

  startMatching() {
    wx.showModal({
      title: '🎯 连线配对',
      content: '配对练习正在打磨中。先来一组古诗填空，练练记忆力吧！',
      confirmText: '开始练习',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) this.startPoemQuiz()
      }
    })
  }
})
