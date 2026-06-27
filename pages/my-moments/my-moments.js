// pages/my-moments/my-moments.js - 我的动态：用户管理自己发的社区动态
const api = require('../../utils/api')

const STATUS = {
  submitted: { label: '审核中', cls: 'pending' },
  public: { label: '已公开', cls: 'public' },
  rejected: { label: '未通过', cls: 'rejected' }
}

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
  data: { items: [], loading: true },

  onShow() { this.load() },
  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()) },

  load(done) {
    api.listMyMoments()
      .then(res => {
        const items = (res.items || []).map(m => {
          const st = STATUS[m.status] || { label: m.status, cls: '' }
          return Object.assign({}, m, { timeText: relTime(m.created_at), statusLabel: st.label, statusCls: st.cls })
        })
        this.setData({ items, loading: false })
        if (done) done()
      })
      .catch(() => { this.setData({ loading: false }); if (done) done() })
  },

  preview(e) {
    const urls = e.currentTarget.dataset.urls || []
    const cur = e.currentTarget.dataset.cur
    if (urls.length) wx.previewImage({ urls, current: cur || urls[0] })
  },

  remove(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除动态', content: '删除后无法恢复，确定吗？', confirmText: '删除',
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
    wx.navigateTo({ url: '/pages/moment-post/moment-post' })
  }
})
