// pages/parent-report/parent-report.js - 家长周报：给家长看孩子的学习价值
const api = require('../../utils/api')
const { track } = require('../../utils/track')

Page({
  data: {
    loading: true,
    nickname: '小诗童',
    learnedTotal: 0,
    streak: 0,
    totalDays: 0,
    level: 1,
    weekCount: 0,
    weekPoems: [],
    weekRangeText: '',
    inviteCode: ''
  },

  onShow() {
    this.loadReport()
    this.loadInviteCode()
  },

  loadInviteCode() {
    const apiUser = wx.getStorageSync('apiUser') || {}
    const code = apiUser.user_id || apiUser.id || ''
    if (code) this.setData({ inviteCode: code })
    // 兜底：本地没有时再请求一次
    if (!code) {
      api.getInviteInfo().then(info => {
        if (info && info.invite_code) this.setData({ inviteCode: info.invite_code })
      }).catch(() => {})
    }
  },

  loadReport() {
    const apiUser = wx.getStorageSync('apiUser') || {}
    const nickname = apiUser.nickname || '小诗童'
    Promise.all([
      api.getStats().catch(() => ({})),
      api.listProgress().catch(() => []),
      api.listAllPoems().catch(() => ({ items: [] }))
    ]).then(([stats, progressRes, poemRes]) => {
      const items = Array.isArray(progressRes) ? progressRes : (progressRes.items || [])
      const poemMap = {}
      ;(poemRes.items || []).forEach(p => { poemMap[Number(p.id)] = p })
      const now = Date.now()
      const weekAgo = now - 7 * 86400000

      const weekItems = items.filter(it => {
        if (!it.learned || !it.last_learned_at) return false
        const t = new Date(String(it.last_learned_at).replace(' ', 'T') + 'Z').getTime()
        return !isNaN(t) && t >= weekAgo
      }).sort((a, b) => this.parseTime(b.last_learned_at) - this.parseTime(a.last_learned_at))

      const weekPoems = weekItems
        .map(it => poemMap[Number(it.poem_id != null ? it.poem_id : it.poemId)])
        .filter(Boolean)
        .map(p => ({ id: p.id, title: p.title, author: p.author }))

      const learnedTotal = stats.learned_poem_count || 0
      this.setData({
        loading: false,
        nickname,
        learnedTotal,
        streak: stats.streak || 0,
        totalDays: stats.total_days || 0,
        level: Math.floor(learnedTotal / 3) + 1,
        weekCount: weekPoems.length,
        weekPoems,
        weekRangeText: this.weekRange(now)
      })
    }).catch(err => {
      console.warn('读取家长周报失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '读取失败，请稍后再试', icon: 'none' })
    })
  },

  parseTime(s) {
    if (!s) return 0
    const t = new Date(String(s).replace(' ', 'T') + 'Z').getTime()
    return isNaN(t) ? 0 : t
  },

  weekRange(now) {
    const fmt = (ms) => {
      const d = new Date(ms)
      return `${d.getMonth() + 1}.${d.getDate()}`
    }
    return `${fmt(now - 6 * 86400000)} - ${fmt(now)}`
  },

  openPoem(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/learn/learn?id=${id}&type=poem` })
  },

  onShareAppMessage() {
    const code = this.data.inviteCode
    track('share_clicked', { type: 'report', from: 'parent-report' })
    return {
      title: `我家孩子已经学会 ${this.data.learnedTotal} 首古诗啦！一起来萌学古诗吧`,
      path: code ? `/pages/index/index?invite=${code}` : '/pages/index/index'
    }
  }
})
