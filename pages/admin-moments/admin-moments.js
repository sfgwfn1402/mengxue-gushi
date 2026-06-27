const api = require('../../utils/api')

const TABS = [
  { value: 'submitted', label: '待审核' },
  { value: 'public', label: '已发布' },
  { value: 'rejected', label: '已驳回' }
]

Page({
  data: {
    tabs: TABS,
    status: 'submitted',
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false
  },

  onLoad() { this.load(1, false) },
  onPullDownRefresh() { this.load(1, false).then(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if (!this.data.loading && this.data.hasMore) this.load(this.data.page + 1, true) },

  switchTab(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.status) return
    this.setData({ status, items: [], page: 1, hasMore: true })
    this.load(1, false)
  },

  load(page, append) {
    this.setData({ loading: true })
    return api.listAdminMoments({ page, page_size: this.data.pageSize, status: this.data.status })
      .then(res => {
        const incoming = res.items || []
        this.setData({
          items: append ? this.data.items.concat(incoming) : incoming,
          total: res.total || 0,
          page,
          hasMore: incoming.length >= this.data.pageSize,
          loading: false
        })
      })
      .catch(() => {
        this.setData({ loading: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  preview(e) {
    const urls = e.currentTarget.dataset.urls || []
    const cur = e.currentTarget.dataset.cur
    if (urls.length) wx.previewImage({ urls, current: cur || urls[0] })
  },

  review(e) {
    const { id, status } = e.currentTarget.dataset
    api.reviewMoment(id, status)
      .then(() => {
        this.setData({ items: this.data.items.filter(m => m.id !== id) })
        wx.showToast({ title: status === 'public' ? '已通过' : '已驳回', icon: 'none' })
      })
      .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }))
  }
})
