// pages/moment-post/moment-post.js - 发布亲子动态：选一张照片 + 写一句
const api = require('../../utils/api')
const { track } = require('../../utils/track')

Page({
  data: {
    imagePath: '',
    content: '',
    publishing: false
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const f = res.tempFiles && res.tempFiles[0]
        if (f && f.tempFilePath) this.setData({ imagePath: f.tempFilePath })
      }
    })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value || '' })
  },

  publish() {
    if (this.data.publishing) return
    if (!this.data.imagePath) { wx.showToast({ title: '选一张照片吧', icon: 'none' }); return }
    this.setData({ publishing: true })
    wx.showLoading({ title: '发布中…', mask: true })
    api.postMoment(this.data.imagePath, (this.data.content || '').trim())
      .then(() => {
        wx.hideLoading()
        this.setData({ publishing: false })
        track('moment_post', {})
        wx.showModal({
          title: '发布成功 🎉',
          content: '动态已提交，审核通过后就会出现在亲子广场',
          showCancel: false, confirmText: '好的',
          success: () => wx.navigateBack()
        })
      })
      .catch(() => {
        wx.hideLoading()
        this.setData({ publishing: false })
        wx.showToast({ title: '发布失败，请重试', icon: 'none' })
      })
  }
})
