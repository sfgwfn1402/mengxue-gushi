// pages/challenge/challenge.js
const api = require('../../utils/api')

Page({
  data: {
    tasks: [],
    completedCount: 0,
    stars: 0,
    streak: 0,
    maxStars: 6,
    showReward: false,
    learnedPoemCount: 0
  },

  onLoad() {
    this.loadTasks()
    this.loadStats()
  },

  onShow() {
    this.loadStats()
  },

  baseTasks() {
    return [
      { id: 'learn1', name: '今日学习', desc: '学习1首新古诗', emoji: '📖', stars: 3, completed: false },
      { id: 'quiz3', name: '答题练习', desc: '答题答对3题', emoji: '🧠', stars: 3, completed: false },
      { id: 'review3', name: '复习巩固', desc: '复习1首已学古诗', emoji: '🔄', stars: 2, completed: false }
    ]
  },

  loadTasks(doneIds) {
    const done = doneIds || []
    const tasks = this.baseTasks().map(t => ({ ...t, completed: done.includes(t.id) }))
    this.setData({ tasks, completedCount: tasks.filter(t => t.completed).length })
  },

  loadStats() {
    api.getStats()
      .then(stats => {
        this.setData({
          stars: stats.stars || 0,
          streak: stats.streak || 0,
          learnedPoemCount: stats.learned_poem_count || 0
        })
        this.loadTasks(stats.today_tasks_done || [])
      })
      .catch(err => {
        console.warn('读取任务统计失败', err)
        wx.showToast({ title: '服务维护中', icon: 'none' })
        this.loadTasks([])
      })
  },

  doTask(e) {
    const { id } = e.currentTarget.dataset
    const task = this.data.tasks.find(t => t.id === id)
    if (!task || task.completed) return

    if (id === 'learn1') {
      wx.switchTab({ url: '/pages/warehouse/warehouse' })
      return
    }

    if (id === 'quiz3') {
      wx.navigateTo({ url: '/pages/quiz/quiz?mode=poem' })
      return
    }

    if (id === 'review3') {
      wx.switchTab({ url: '/pages/warehouse/warehouse' })
      return
    }

    this.completeTask(task)
  },

  completeTask(task) {
    api.completeTask(task.id, task.stars)
      .then(res => {
        wx.showToast({ title: `🎉 +${res.stars_added || 0} ✨`, icon: 'none' })
        this.loadStats()
      })
      .catch(err => {
        console.warn('完成任务失败', err)
        wx.showToast({ title: '服务维护中', icon: 'none' })
      })
  },

  onShareAppMessage() {
    return {
      title: `我在萌学古诗收集了 ${this.data.stars || 0} 点诗光，一起读古诗吧`,
      path: '/pages/challenge/challenge'
    }
  },

  onShareTimeline() {
    return {
      title: `我在萌学古诗收集了 ${this.data.stars || 0} 点诗光，一起读古诗吧`
    }
  },

  showStatsHelp() {
    wx.showModal({
      title: '数据说明',
      content: [
        '✨ 我的诗光：累计收集到的诗光。学习一首新诗 +3，完成一次答题 +3，复习已学古诗 +2，每日打卡/分享 +2。同一天同一任务只加一次。',
        '',
        '🔥 连续天数：来自每日打卡记录，连续每天打卡就会递增；中断后重新计算。',
        '',
        '📋 今日完成：今天 4 个诗光任务的完成数量，包括今日学习、答题练习、复习巩固、分享打卡。'
      ].join('\n'),
      showCancel: false,
      confirmText: '知道啦'
    })
  },

  goToWarehouse() {
    wx.switchTab({ url: '/pages/warehouse/warehouse' })
  }
})
