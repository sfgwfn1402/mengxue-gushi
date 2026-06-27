// pages/plaza/plaza.js - 亲子广场：家长晒娃动态信息流
const api = require('../../utils/api')
const { track } = require('../../utils/track')

function relTime(s) {
  if (!s) return ''
  const t = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).getTime()
  if (isNaN(t)) return ''
  const diff = Date.now() - t
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + '天前'
  const d = new Date(t)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

Page({
  data: {
    items: [],
    page: 1,
    pageSize: 10,
    loading: false,
    hasMore: true,
    myId: ''
  },

  onLoad() {
    const apiUser = wx.getStorageSync('apiUser') || {}
    this.setData({ myId: apiUser.user_id || apiUser.id || '' })
    track('plaza_open', {})
    this.load(true)
  },

  onShow() {
    // 发布后返回刷新
    if (this._needRefresh) { this._needRefresh = false; this.load(true) }
  },

  onPullDownRefresh() {
    this.load(true, () => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(false)
  },

  load(reset, done) {
    if (this.data.loading) { if (done) done(); return }
    const page = reset ? 1 : this.data.page
    this.setData({ loading: true })
    api.listMoments({ page, page_size: this.data.pageSize })
      .then(res => {
        const incoming = (res.items || []).map(m => Object.assign({}, m, { timeText: relTime(m.created_at) }))
        const items = reset ? incoming : this.data.items.concat(incoming)
        this.setData({
          items,
          page: page + 1,
          hasMore: incoming.length >= this.data.pageSize,
          loading: false
        })
        if (done) done()
      })
      .catch(() => { this.setData({ loading: false }); if (done) done() })
  },

  toggleLike(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.items.find(m => m.id === id)
    if (!item) return
    const willLike = !item.liked_by_me
    const call = willLike ? api.likeMoment(id) : api.unlikeMoment(id)
    // 乐观更新
    this.patchItem(id, { liked_by_me: willLike, like_count: Math.max(0, (item.like_count || 0) + (willLike ? 1 : -1)) })
    call.then(res => {
      this.patchItem(id, { liked_by_me: !!res.liked, like_count: typeof res.like_count === 'number' ? res.like_count : item.like_count })
    }).catch(() => {
      this.patchItem(id, { liked_by_me: item.liked_by_me, like_count: item.like_count })
    })
  },

  patchItem(id, patch) {
    const items = this.data.items.map(m => m.id === id ? Object.assign({}, m, patch) : m)
    this.setData({ items })
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) wx.previewImage({ urls: [url], current: url })
  },

  deleteMine(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除动态', content: '确定删除这条动态吗？', confirmText: '删除',
      success: res => {
        if (!res.confirm) return
        api.deleteMoment(id).then(() => {
          this.setData({ items: this.data.items.filter(m => m.id !== id) })
          wx.showToast({ title: '已删除', icon: 'none' })
        }).catch(() => wx.showToast({ title: '删除失败', icon: 'none' }))
      }
    })
  },

  goPost() {
    this._needRefresh = true
    wx.navigateTo({ url: '/pages/moment-post/moment-post' })
  }
})
