// pages/moment-post/moment-post.js - 发布/编辑社区动态：最多6张照片 + 文字
const api = require('../../utils/api')
const { track } = require('../../utils/track')

const MAX = 6

Page({
  data: {
    editId: '',
    // images: [{ url(显示), key(已有图object_path; 新图为''), isNew }]
    images: [],
    max: MAX,
    content: '',
    publishing: false
  },

  onLoad(options) {
    if (options && options.id) {
      const m = wx.getStorageSync('editingMoment') || null
      if (m && m.id === options.id) {
        const images = (m.images || []).map((url, i) => ({
          url, key: (m.object_paths || [])[i] || '', isNew: false
        })).filter(it => it.key) // 没有object_path的旧图无法保留，过滤掉
        this.setData({ editId: options.id, content: m.content || '', images })
        wx.setNavigationBarTitle({ title: '编辑动态' })
      } else {
        wx.showToast({ title: '内容已失效，请重新进入', icon: 'none' })
      }
    }
  },

  chooseImage() {
    const remain = MAX - this.data.images.length
    if (remain <= 0) { wx.showToast({ title: '最多6张哦', icon: 'none' }); return }
    wx.chooseMedia({
      count: remain, mediaType: ['image'], sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: res => {
        const adds = (res.tempFiles || []).map(f => ({ url: f.tempFilePath, key: '', isNew: true })).filter(it => it.url)
        this.setData({ images: this.data.images.concat(adds).slice(0, MAX) })
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
    const urls = this.data.images.map(it => it.url)
    wx.previewImage({ urls, current: urls[i] })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value || '' })
  },

  publish() {
    if (this.data.publishing) return
    if (!this.data.images.length) { wx.showToast({ title: '选张照片吧', icon: 'none' }); return }
    this.setData({ publishing: true })
    wx.showLoading({ title: this.data.editId ? '保存中…' : '发布中…', mask: true })
    // 新图逐张上传拿object_path，已有图直接用key；按顺序拼出最终路径
    const tasks = this.data.images.map(it =>
      it.isNew ? api.uploadMomentImage(it.url) : Promise.resolve(it.key)
    )
    Promise.all(tasks)
      .then(keys => {
        const paths = keys.filter(Boolean)
        if (!paths.length) throw new Error('no image')
        return this.data.editId
          ? api.editMoment(this.data.editId, paths, (this.data.content || '').trim())
          : api.postMoment(paths, (this.data.content || '').trim())
      })
      .then(() => {
        wx.hideLoading()
        this.setData({ publishing: false })
        wx.removeStorageSync('editingMoment')
        track(this.data.editId ? 'moment_edit' : 'moment_post', {})
        wx.showModal({
          title: this.data.editId ? '已重新提交 🎉' : '发布成功 🎉',
          content: '动态已提交，审核通过后就会出现在社区',
          showCancel: false, confirmText: '好的',
          success: () => wx.navigateBack()
        })
      })
      .catch(() => {
        wx.hideLoading()
        this.setData({ publishing: false })
        wx.showToast({ title: '操作失败，请重试', icon: 'none' })
      })
  }
})
