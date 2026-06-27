// pages/color/color.js - 诗配画·在线画板：给古诗画一幅画，手指涂画，保存/发布
const app = getApp()
const api = require('../../utils/api')
const { track } = require('../../utils/track')

const COLORS = ['#3A3A3A', '#FF6B6B', '#FF9F1C', '#FFD166', '#06D6A0', '#4D96FF', '#9B5DE5', '#F15BB5', '#8B5E3C', '#FFFFFF']
const SIZES = [6, 12, 22]

Page({
  data: {
    poem: null,
    lines: [],
    colors: COLORS,
    color: '#FF6B6B',
    sizes: SIZES,
    size: 12,
    erasing: false,
    saving: false
  },

  onLoad(options) {
    const id = Number(options && options.id)
    if (id) {
      const local = (app.getPoemById && app.getPoemById(id)) || null
      if (local) this.setPoem(local)
      else api.getPoem(id).then(p => this.setPoem(p)).catch(() => {})
    }
    this.initCanvas()
  },

  setPoem(poem) {
    if (!poem) return
    const lines = String(poem.content || '').split(/[，。！？、；\n]/).map(s => s.trim()).filter(Boolean)
    this.setData({ poem, lines })
    wx.setNavigationBarTitle({ title: `给《${poem.title}》画一画` })
  },

  initCanvas() {
    wx.createSelectorQuery().select('#paint').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0] || !res[0].node) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = (wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio) || 2
      canvas.width = res[0].width * dpr
      canvas.height = res[0].height * dpr
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, res[0].width, res[0].height)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      this.canvas = canvas
      this.ctx = ctx
      this._w = res[0].width
      this._h = res[0].height
      this._drawn = false
    })
  },

  strokeStyle() {
    return this.data.erasing ? '#FFFFFF' : this.data.color
  },
  strokeWidth() {
    return this.data.erasing ? this.data.size * 2.2 : this.data.size
  },

  onTouchStart(e) {
    const t = e.touches[0]
    this._last = { x: t.x, y: t.y }
    const ctx = this.ctx
    if (!ctx) return
    // 点一下也留个点
    ctx.beginPath()
    ctx.fillStyle = this.strokeStyle()
    ctx.arc(t.x, t.y, this.strokeWidth() / 2, 0, Math.PI * 2)
    ctx.fill()
    this._drawn = true
  },

  onTouchMove(e) {
    const ctx = this.ctx
    if (!ctx || !this._last) return
    const t = e.touches[0]
    ctx.beginPath()
    ctx.strokeStyle = this.strokeStyle()
    ctx.lineWidth = this.strokeWidth()
    ctx.moveTo(this._last.x, this._last.y)
    ctx.lineTo(t.x, t.y)
    ctx.stroke()
    this._last = { x: t.x, y: t.y }
    this._drawn = true
  },

  pickColor(e) {
    this.setData({ color: e.currentTarget.dataset.color, erasing: false })
  },
  pickSize(e) {
    this.setData({ size: Number(e.currentTarget.dataset.size) })
  },
  toggleEraser() {
    this.setData({ erasing: !this.data.erasing })
  },
  clearCanvas() {
    wx.showModal({
      title: '清空画布', content: '确定要全部擦掉重画吗？', confirmText: '清空',
      success: res => {
        if (res.confirm && this.ctx) {
          this.ctx.fillStyle = '#FFFFFF'
          this.ctx.fillRect(0, 0, this._w, this._h)
          this._drawn = false
        }
      }
    })
  },

  exportImage() {
    return new Promise((resolve, reject) => {
      if (!this.canvas) { reject(new Error('canvas not ready')); return }
      if (!this._drawn) { reject(new Error('empty')); return }
      wx.canvasToTempFilePath({
        canvas: this.canvas,
        success: res => resolve(res.tempFilePath),
        fail: reject
      }, this)
    })
  },

  saveAlbum() {
    this.exportImage()
      .then(fp => wx.saveImageToPhotosAlbum({
        filePath: fp,
        success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: () => wx.showToast({ title: '保存失败，检查相册权限', icon: 'none' })
      }))
      .catch(err => {
        if (err && err.message === 'empty') wx.showToast({ title: '先画点什么吧～', icon: 'none' })
      })
  },

  publish() {
    const poem = this.data.poem
    if (!poem) { this.saveAlbum(); return }
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '发布中…', mask: true })
    this.exportImage()
      .then(fp => api.uploadArtwork(poem.id, fp, { title: `${poem.title}·我的画`, description: '在萌学古诗画的诗配画' }))
      .then(() => {
        wx.hideLoading()
        this.setData({ saving: false })
        track('color_publish', { poem_id: poem.id })
        wx.showModal({
          title: '发布成功 🎉', content: '诗配画已提交，审核通过后就能在“发现”看到啦', showCancel: false, confirmText: '好的',
          success: () => wx.navigateBack()
        })
      })
      .catch(err => {
        wx.hideLoading()
        this.setData({ saving: false })
        if (err && err.message === 'empty') { wx.showToast({ title: '先画点什么吧～', icon: 'none' }); return }
        wx.showToast({ title: '发布失败，请重试', icon: 'none' })
      })
  }
})
