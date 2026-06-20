const api = require('../../utils/api')

const TYPE_LABELS = {
  content: '内容建议',
  fun: '快乐学习',
  audio: '朗读音频',
  image: '插画动画',
  practice: '练习背诵',
  bug: '问题反馈',
  'deploy-test': '部署测试'
}

const STATUS_LABELS = {
  pending: '未处理',
  reviewed: '已查看',
  resolved: '已处理',
  ignored: '暂不处理'
}

Page({
  data: {
    loading: false,
    items: [],
    total: 0,
    page: 1,
    pageSize: 50,
    hasMore: true,
    status: '',
    statusTabs: [
      { value: '', label: '全部' },
      { value: 'pending', label: '未处理' },
      { value: 'resolved', label: '已处理' },
      { value: 'ignored', label: '暂不处理' }
    ]
  },

  onLoad() {
    this.loadFeedback(1, false)
  },

  onPullDownRefresh() {
    this.loadFeedback(1, false).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.loading && this.data.hasMore) this.loadFeedback(this.data.page + 1, true)
  },

  switchStatus(e) {
    const status = e.currentTarget.dataset.status || ''
    this.setData({ status, page: 1, hasMore: true })
    this.loadFeedback(1, false)
  },

  loadFeedback(page, append) {
    this.setData({ loading: true })
    return api.listAdminFeedback({
      page,
      page_size: this.data.pageSize,
      status: this.data.status
    })
      .then(res => {
        const items = (res.items || []).map(item => this.decorateItem(item))
        const nextItems = append ? this.data.items.concat(items) : items
        const total = res.total || nextItems.length
        this.setData({
          items: nextItems,
          total,
          page,
          hasMore: nextItems.length < total,
          loading: false
        })
      })
      .catch(err => {
        console.warn('读取用户反馈失败', err)
        this.setData({ loading: false })
        const statusCode = err && err.statusCode
        wx.showToast({ title: statusCode === 403 ? '无管理员权限' : '读取失败', icon: 'none' })
        if (statusCode === 403 || statusCode === 401) setTimeout(() => wx.navigateBack(), 700)
      })
  },

  decorateItem(item) {
    return Object.assign({}, item, {
      typeLabel: TYPE_LABELS[item.feedback_type] || item.feedback_type || '反馈',
      statusLabel: STATUS_LABELS[item.status] || item.status || '未处理',
      createdText: this.formatTime(item.created_at),
      painText: item.pain_point || '未填写',
      suggestionText: item.suggestion || '未填写',
      contactText: item.contact || '未填写'
    })
  },

  formatTime(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    const pad = n => String(n).padStart(2, '0')
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  },

  markResolved(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showLoading({ title: '处理中...' })
    api.updateAdminFeedbackStatus(id, { status: 'resolved', admin_note: '已处理' })
      .then(updated => {
        const decorated = this.decorateItem(updated)
        const items = this.data.items.map(item => item.id === id ? decorated : item)
        this.setData({ items })
        wx.showToast({ title: '已处理', icon: 'success' })
      })
      .catch(err => {
        console.warn('更新反馈状态失败', err)
        wx.showToast({ title: '处理失败', icon: 'none' })
      })
      .then(() => wx.hideLoading())
  },

  copyContact(e) {
    const text = e.currentTarget.dataset.text
    if (!text || text === '未填写') return
    wx.setClipboardData({ data: text })
  }
})
