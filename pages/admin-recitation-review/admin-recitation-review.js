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
    return api.listAdminRecitations(params)
      .then(res => {
        const items = (res.items || []).map(item => this.decorateItem(item))
        // 批量补齐诗名
        return this.fillPoemTitles(items).then(() => {
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
      })
      .catch(err => {
        console.warn('读取朗读列表失败', err)
        this.setData({ loading: false })
        const statusCode = err && err.statusCode
        wx.showToast({ title: statusCode === 403 ? '无管理员权限' : '读取失败', icon: 'none' })
        if (statusCode === 403 || statusCode === 401) setTimeout(() => wx.navigateBack(), 700)
      })
  },

  // 收集所有不同的 poem_id，批量拉取诗名
  fillPoemTitles(items) {
    // 已有 poemTitle 的跳过
    const needFetch = items.filter(i => i.poem_id && !i.poemTitle)
    if (!needFetch.length) return Promise.resolve()
    const ids = [...new Set(needFetch.map(i => i.poem_id))]
    // 批量拉取（并发但限制到合理数量）
    return Promise.allSettled(ids.map(id =>
      api.getPoem(id).then(poem => {
        const title = poem && (poem.title || poem.poem_title)
        if (title) {
          for (const item of items) {
            if (item.poem_id === id) item.poemTitle = title
          }
        }
      }).catch(() => {})
    )).then(() => {
      // 重新生成 poemText（items 是对象引用，外层 setData 后视图自动刷新）
      for (const item of items) {
        item.poemText = this.formatPoemLabel(item)
      }
    })
  },

  decorateItem(item) {
    return Object.assign({}, item, {
      statusLabel: STATUS_LABELS[item.status] || item.status || '未知',
      createdText: this.formatTime(item.created_at),
      durationText: this.formatDuration(item.duration_seconds),
      poemText: this.formatPoemLabel(item)
    })
  },

  formatPoemLabel(item) {
    if (!item) return '未知古诗'
    // poemTitle 来自 loadList 时由 getPoem 预加载
    if (item.poemTitle) return item.poemTitle
    if (item.poem_id) return `古诗 #${item.poem_id}`
    return '未知古诗'
  },

  formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '—'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    if (m <= 0) return `${s} 秒`
    return `${m}'${String(s).padStart(2, '0')}"`
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

  playPreview(e) {
    e && e.stopPropagation && e.stopPropagation()
    const id = e.currentTarget.dataset.id
    if (!id) return
    const innerAudioContext = this._previewAudio || (this._previewAudio = wx.createInnerAudioContext())
    innerAudioContext.stop()
    innerAudioContext.obeyMuteSwitch = false
    innerAudioContext.src = `${api.config.apiBaseUrl}/recitations/${id}/audio`
    innerAudioContext.onError(() => {
      wx.showToast({ title: '音频加载失败', icon: 'none' })
    })
    innerAudioContext.play()
    wx.showToast({ title: '试听中...', icon: 'none', duration: 800 })
  },

  approve(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.review(id, 'public', '通过')
  },

  reject(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '驳回这份朗读？',
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
    api.reviewRecitation(id, status)
      .then(() => {
        wx.showToast({ title: successText, icon: 'success' })
        // 重新拉当前 tab 列表
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
