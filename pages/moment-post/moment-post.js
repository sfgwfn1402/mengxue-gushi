// pages/moment-post/moment-post.js - 发布亲子动态：最多6张照片 + 文字
const api = require('../../utils/api')
const { track } = require('../../utils/track')

const MAX = 6

Page({
  data: {
    images: [],   // 本地临时路径
    max: MAX,
    content: '',
    publishing: false
  },

  chooseImage() {
    const remain = MAX - this.data.images.length
    if (remain <= 0) { wx.showToast({ title: '最多6张哦', icon: 'none' }); return }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean)
        this.setData({ images: this.data.images.concat(paths).slice(0, MAX) })
      }
    })
  },

  removeImage(e) {
    const i = e.currentTarget.dataset.index
    const images = this.data.images.slice()
    images.splice(i, 1)
    this.setData({ images })
  },

  previewImage(e) {
    const i = e.currentTarget.dataset.index
    wx.previewImage({ urls: this.data.images, current: this.data.images[i] })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value || '' })
  },

  publish() {
    if (this.data.publishing) return
    if (!this.data.images.length) { wx.showToast({ title: '选张照片吧', icon: 'none' }); return }
    this.setData({ publishing: true })
    wx.showLoading({ title: '发布中…', mask: true })
    // 逐张上传 → 收集 object_path → 创建动态
    const uploads = this.data.images.map(p => api.uploadMomentImage(p))
    Promise.all(uploads)
      .then(paths => api.postMoment(paths.filter(Boolean), (this.data.content || '').trim()))
      .then(() => {
        wx.hideLoading()
        this.setData({ publishing: false })
        track('moment_post', { images: this.data.images.length })
        wx.showModal({
          title: '发布成功 🎉',
          content: '动态已提交，审核通过后就会出现在社区',
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
