const api = require('../../utils/api')

// 事件名 → 友好中文标签
const EVENT_LABELS = {
  page_view: '页面访问',
  poem_open: '打开诗词',
  poem_learn: '学会一首',
  poem_follow: '完成跟读',
  poem_recite: '背诵闯关',
  ai_score_used: 'AI评分(发起)',
  ai_score_done: 'AI评分(完成)',
  checkin: '打卡',
  share_clicked: '点击分享',
  recitation_play: '听社区朗诵',
  listen_open: '进磨耳朵',
  listen_play: '磨耳朵播放',
  story_open: '进诗词故事',
  story_view: '看某首故事',
  story_listen: '故事页听读',
  game_hub_open: '进游戏中心',
  game_pick: '选了某游戏',
  game_start: '开始某游戏',
  game_finish: '玩完某游戏',
  invite_landed: '邀请落地',
  review_done: '复习一首',
  reminder_subscribed: '开启提醒',
  daily_plan_view: '看到今日计划',
  daily_plan_tap: '点今日计划项',
  daily_plan_complete: '完成今日计划'
}

Page({
  data: {
    loading: true,
    isAdmin: false,
    days: 7,
    totalEvents: 0,
    activeUsers: 0,
    eventRows: [],
    dailyRows: [],
    dailyMax: 1,
    topPoems: []
  },

  onLoad() {
    api.login()
      .then(() => api.getMe())
      .then(user => {
        const isAdmin = user && user.role === 'admin'
        this.setData({ isAdmin })
        if (!isAdmin) {
          wx.showToast({ title: '无管理员权限', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 600)
          return
        }
        this.loadAnalytics()
      })
      .catch(() => {
        this.setData({ loading: false, isAdmin: false })
        wx.showToast({ title: '无管理员权限', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 600)
      })
  },

  switchRange(e) {
    const days = parseInt(e.currentTarget.dataset.days)
    if (days === this.data.days) return
    this.setData({ days })
    this.loadAnalytics()
  },

  loadAnalytics() {
    this.setData({ loading: true })
    api.getAnalytics(this.data.days)
      .then(res => {
        const eventRows = (res.event_counts || []).map(it => ({
          name: it.event_name,
          label: EVENT_LABELS[it.event_name] || it.event_name,
          count: it.count
        }))
        const dailyRows = (res.daily_active || []).map(it => ({
          day: it.day,
          users: it.users,
          events: it.events
        }))
        const dailyMax = dailyRows.reduce((m, it) => Math.max(m, it.events), 1)
        const topPoems = (res.top_poems || []).map((it, i) => ({
          rank: i + 1,
          title: it.title || `#${it.poem_id}`,
          count: it.count
        }))
        this.setData({
          loading: false,
          totalEvents: res.total_events || 0,
          activeUsers: res.active_users || 0,
          eventRows,
          dailyRows,
          dailyMax,
          topPoems
        })
      })
      .catch(err => {
        console.warn('读取数据看板失败', err)
        this.setData({ loading: false })
        wx.showToast({ title: '读取失败', icon: 'none' })
      })
  }
})
