const api = require('../../utils/api')

Page({
  data: {
    loading: true,
    isAdmin: false
  },

  onLoad() {
    this.checkAdmin()
  },

  checkAdmin() {
    api.login()
      .then(() => api.getMe())
      .then(user => {
        const isAdmin = user && user.role === 'admin'
        this.setData({ loading: false, isAdmin })
        if (!isAdmin) {
          wx.showToast({ title: '无管理员权限', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 600)
        }
      })
      .catch(err => {
        console.warn('管理员校验失败', err)
        this.setData({ loading: false, isAdmin: false })
        wx.showToast({ title: '无管理员权限', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 600)
      })
  },

  openFeedback() {
    wx.navigateTo({ url: '/pages/admin-feedback/admin-feedback' })
  },

  openRecitationReview() {
    wx.navigateTo({ url: '/pages/admin-recitation-review/admin-recitation-review' })
  },

  openArtworkReview() {
    wx.navigateTo({ url: '/pages/admin-artwork-review/admin-artwork-review' })
  }
})
