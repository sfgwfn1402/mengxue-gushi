const api = require('../../utils/api')

const STATUS_LABELS = {
  active: '私有',
  submitted: '待审核',
  public: '已发布',
  rejected: '已驳回',
  deleted: '已删除'
}

const STATUS_TABS = [
  { value: 'submitted', label: '待审核' },
  { value: 'public', label: '已发布' },
  { value: 'rejected', label: '已驳回' },
  { value: '', label: '全部' }
]

Page({
  data: {
    loading: false,
    items: [],
    total: 0,
    pendingCount: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    status: 'submitted',
    expandedId: '',
    statusTabs: STATUS_TABS
  },

  onLoad() {
    this.loadList(1, false)
  },

  onPullDownRefresh() {
    this.loadList(1, false).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.loading && this.data.hasMore) this.loadList(this.data.page + 1, true)
  },

  switchStatus(e) {
    const status = e.currentTarget.dataset.status || ''
    if (status === this.data.status) return
    this.setData({ status, page: 1, hasMore: true, items: [], expandedId: '' })
    this.loadList(1, false)
  },

  loadList(page, append) {
    this.setData({ loading: true })
    const params = {
      page,
      page_size: this.data.pageSize
    }
    if (this.data.status) params.status = this.data.status
    return api.listAdminArtworks(params)
      .then(res => {
        const items = (res.items || []).map(item => this.decorateItem(item))
        const nextItems = append ? this.data.items.concat(items) : items
        const total = res.total || nextItems.length
        this.setData({
          items: nextItems,
          total,
          pendingCount: this.data.status === 'submitted' ? total : 0,
          page,
          hasMore: nextItems.length < total,
          loading: false
        })
      })
      .catch(err => {
        console.warn('读取诗配画列表失败', err)
        this.setData({ loading: false })
        const statusCode = err && err.statusCode
        wx.showToast({ title: statusCode === 403 ? '无管理员权限' : '读取失败', icon: 'none' })
        if (statusCode === 403 || statusCode === 401) setTimeout(() => wx.navigateBack(), 700)
      })
  },

  decorateItem(item) {
    return Object.assign({}, item, {
      statusLabel: STATUS_LABELS[item.status] || item.status || '未知',
      createdText: this.formatTime(item.created_at),
      poemText: item.poem_title ? `《${item.poem_title}》` : `古诗 #${item.poem_id}`,
      descriptionText: item.description || '未填写说明',
      imageUrl: this.normalizeMediaUrl(item.image_url || item.imageUrl || '')
    })
  },

  normalizeMediaUrl(url) {
    if (!url) return ''
    const value = String(url)
    if (/^https?:\/\//.test(value)) return value
    const mediaBase = (api.config.mediaBaseUrl || '').replace(/\/$/, '')
    if (!mediaBase) return value
    return `${mediaBase}${value.startsWith('/') ? '' : '/'}${value}`
  },

  formatTime(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    const pad = n => String(n).padStart(2, '0')
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  },

  toggleItem(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ expandedId: this.data.expandedId === id ? '' : id })
  },

  previewImage(e) {
    e && e.stopPropagation && e.stopPropagation()
    const url = e.currentTarget.dataset.url
    const urls = this.data.items.map(item => item.imageUrl).filter(Boolean)
    if (!url || !urls.length) return
    wx.previewImage({ current: url, urls })
  },

  approve(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.review(id, 'public', '已发布')
  },

  reject(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '驳回这份诗配画？',
      content: '用户会看到"已驳回"，但可以继续修改后重新提交。',
      confirmText: '确认驳回',
      cancelText: '取消',
      confirmColor: '#C0392B',
      success: ({ confirm }) => {
        if (confirm) this.review(id, 'rejected', '已驳回')
      }
    })
  },

  review(id, status, successText) {
    wx.showLoading({ title: '处理中...' })
    api.reviewArtwork(id, status)
      .then(() => {
        wx.showToast({ title: successText, icon: 'success' })
        this.setData({ items: [], page: 1, hasMore: true, expandedId: '' })
        this.loadList(1, false)
      })
      .catch(err => {
        console.warn('审核失败', err)
        wx.showToast({ title: '操作失败', icon: 'none' })
      })
      .then(() => wx.hideLoading())
  }
})
