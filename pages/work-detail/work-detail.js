const api = require('../../utils/api')
const audioManager = require('../../utils/audio-manager')
const audioCache = require('../../utils/audio-cache')

Page({
  data: {
    id: '',
    type: 'recitation',
    work: null,
    mediaUrl: '',
    createdText: '',
    loading: true,
    playing: false
  },

  onLoad(options) {
    this.setData({ id: options.id || '', type: options.type || 'recitation' })
    this.loadWork()
  },

  onUnload() { this.stopAudio() },

  loadWork() {
    const cached = wx.getStorageSync('currentWorkDetail')
    if (cached && cached.id === this.data.id && cached.type === this.data.type) {
      this.applyWork(cached.item)
      return
    }
    const req = this.data.type === 'artwork'
      ? api.getArtwork(this.data.id)
      : api.getRecitation(this.data.id)
    req.then(item => {
      if (!item || this.data.type !== 'recitation' || item.poem_title || item.poemTitle) {
        this.applyWork(item || null)
        return
      }
      api.getPoem(item.poem_id || item.poemId)
        .then(poem => this.applyWork(Object.assign({}, item, { poem_title: poem.title, poem_author: poem.author, poem_dynasty: poem.dynasty })))
        .catch(() => this.applyWork(item))
    }).catch(err => {
      console.warn('读取作品详情失败', err)
      this.setData({ loading: false, work: null })
    })
  },

  applyWork(work) {
    if (!work) {
      this.setData({ loading: false, work: null })
      return
    }
    if (this.data.type === 'recitation' && !(work.poem_title || work.poemTitle) && (work.poem_id || work.poemId) && !work.__poemTitleLoading) {
      api.getPoem(work.poem_id || work.poemId)
        .then(poem => this.applyWork(Object.assign({}, work, { __poemTitleLoading: true, poem_title: poem.title, poem_author: poem.author, poem_dynasty: poem.dynasty })))
        .catch(() => this.applyWork(Object.assign({}, work, { __poemTitleLoading: true })))
      return
    }
    const rawUrl = this.data.type === 'artwork' ? (work.image_url || work.imageUrl) : `${api.config.apiBaseUrl}/recitations/${work.id}/audio`
    this.setData({
      loading: false,
      work,
      mediaUrl: this.normalizeMediaUrl(rawUrl),
      createdText: this.formatDate(work.created_at || work.createdAt)
    })
  },

  normalizeMediaUrl(url) {
    if (!url) return ''
    const value = String(url)
    const minioBase = (api.config.minioBaseUrl || '').replace(/\/$/, '')
    const mediaBase = (api.config.mediaBaseUrl || api.config.apiBaseUrl.replace(/\/api$/, '')).replace(/\/$/, '')
    // 用户朗读作品存在 MinIO 私有 bucket，播放必须走 Rust API 代理，不能直接播 9000。
    if (minioBase && mediaBase && value.startsWith(`${minioBase}/recitations/`)) {
      return `${mediaBase}/recitations/${value.slice(`${minioBase}/recitations/`.length)}`
    }
    if (/^https?:\/\//.test(value)) return value
    return `${mediaBase}${value.startsWith('/') ? '' : '/'}${value}`
  },

  formatDate(value) {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  },

  async toggleAudio() {
    if (this.data.playing) {
      this.stopAudio()
      return
    }
    if (!this.data.mediaUrl) {
      wx.showToast({ title: '没有音频地址', icon: 'none' })
      return
    }
    this.stopAudio()
    let audioPath = this.data.mediaUrl
    wx.showLoading({ title: '加载音频...' })
    try {
      audioPath = await audioCache.downloadAndCache(this.data.mediaUrl, { tag: 'recitation-audio' })
    } catch (err) {
      console.warn('作品详情音频缓存失败，尝试直接播放远程 URL', err, this.data.mediaUrl)
      audioPath = this.data.mediaUrl
    }
    wx.hideLoading()
    this.audio = audioManager.create('work-detail-audio')
    this.audio.obeyMuteSwitch = false
    this.audio.onEnded(() => this.setData({ playing: false }))
    this.audio.onStop(() => this.setData({ playing: false }))
    this.audio.onError(err => {
      const msg = err && err.errMsg ? err.errMsg : String(err || '')
      console.warn('作品详情播放失败', err, audioPath)
      this.setData({ playing: false })
      wx.showToast({ title: msg.includes('background') || msg.includes('no permission') ? '请回到小程序前台播放' : '播放失败', icon: 'none' })
    })
    this.audio.src = audioPath
    this.setData({ playing: true })
    audioManager.play(this.audio)
  },

  stopAudio() {
    if (this.audio) {
      try { audioManager.ignoreAudioPromise(this.audio.stop && this.audio.stop()) } catch (e) {}
      try { audioManager.ignoreAudioPromise(this.audio.destroy && this.audio.destroy()) } catch (e) {}
      this.audio = null
    }
    if (this.data.playing) this.setData({ playing: false })
  },

  previewArtwork() {
    if (!this.data.mediaUrl) return
    wx.previewImage({ urls: [this.data.mediaUrl], current: this.data.mediaUrl })
  },

  deleteWork() {
    const { id, type } = this.data
    wx.showModal({
      title: '删除作品？',
      content: '删除后不会在我的诗集中显示。',
      confirmText: '删除',
      confirmColor: '#DC2626',
      success: res => {
        if (!res.confirm) return
        const req = type === 'artwork' ? api.deleteArtwork(id) : api.deleteRecitation(id)
        req.then(() => {
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 500)
        }).catch(err => {
          console.warn('删除作品失败', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        })
      }
    })
  },

  openShareMenu() {
    wx.showActionSheet({
      itemList: ['生成分享卡', '复制分享文案'],
      success: res => {
        if (res.tapIndex === 0) this.makeShareCard()
        if (res.tapIndex === 1) this.copyShareText()
      }
    })
  },

  makeShareCard() {
    if (!this.data.work) return
    wx.showLoading({ title: '生成卡片…' })
    this.drawShareCard().then(filePath => {
      wx.hideLoading()
      wx.showActionSheet({
        itemList: ['预览卡片', '保存到相册', '复制分享文案'],
        success: res => {
          if (res.tapIndex === 0) wx.previewImage({ urls: [filePath], current: filePath })
          if (res.tapIndex === 1) this.saveImage(filePath)
          if (res.tapIndex === 2) this.copyShareText()
        }
      })
    }).catch(err => {
      wx.hideLoading()
      console.warn('生成详情分享卡失败', err)
      wx.showToast({ title: '生成失败', icon: 'none' })
    })
  },

  drawShareCard() {
    const work = this.data.work
    const isArtwork = this.data.type === 'artwork'
    const poemTitle = work.poem_title || work.poemTitle || '古诗作品'
    const workTitle = work.title || (isArtwork ? '我的诗配画' : '我的朗读')
    const draw = ({ imagePath, qrcodePath }) => new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext('detailShareCanvas', this)
      const W = 600, H = 900
      ctx.setFillStyle('#FFF8DF'); ctx.fillRect(0, 0, W, H)
      const grd = ctx.createLinearGradient(0, 0, W, 240)
      grd.addColorStop(0, '#FFD76A'); grd.addColorStop(1, '#FF8A65')
      ctx.setFillStyle(grd); ctx.fillRect(0, 0, W, 240)
      ctx.setFillStyle('#5B3300'); ctx.setTextAlign('center')
      ctx.setFontSize(34); ctx.fillText('萌学古诗 · 作品详情', W / 2, 62)
      ctx.setFontSize(52); ctx.fillText(`《${poemTitle}》`, W / 2, 135)
      ctx.setFontSize(26); ctx.fillText(isArtwork ? '我画下的诗意' : '我读出的诗意', W / 2, 188)
      ctx.setFillStyle('#fff'); this.roundRect(ctx, 42, 270, 516, 360, 28); ctx.fill()
      if (imagePath) {
        ctx.save(); this.clipRoundRect(ctx, 62, 290, 476, 320, 22); ctx.drawImage(imagePath, 62, 290, 476, 320); ctx.restore()
      } else {
        ctx.setFillStyle('#EEF6FF'); this.roundRect(ctx, 62, 290, 476, 320, 22); ctx.fill()
        ctx.setFontSize(92); ctx.fillText('🎙️', W / 2, 420)
        ctx.setFillStyle('#2563EB'); ctx.setFontSize(34); ctx.fillText('打开小程序听我的朗读', W / 2, 500)
      }
      ctx.setFillStyle('#2F2A1F'); ctx.setFontSize(34); ctx.fillText(workTitle, W / 2, 690)
      ctx.setFillStyle('#8A6B2E'); ctx.setFontSize(24); ctx.fillText(this.data.createdText ? `完成于 ${this.data.createdText}` : '我的古诗成长作品', W / 2, 732)
      ctx.setFillStyle('#FFFFFF'); this.roundRect(ctx, 64, 760, 472, 104, 28); ctx.fill()
      if (qrcodePath) {
        ctx.drawImage(qrcodePath, 82, 774, 76, 76)
        ctx.setFillStyle('#FF6B4A'); ctx.setTextAlign('left'); ctx.setFontSize(27); ctx.fillText(isArtwork ? '扫码查看我的诗画' : '扫码听我的朗读', 176, 812)
        ctx.setFillStyle('#9CA3AF'); ctx.setFontSize(20); ctx.fillText('小程序码直达作品详情', 176, 842)
        ctx.setTextAlign('center')
      } else {
        ctx.setFillStyle('#FF6B4A'); ctx.setFontSize(28); ctx.fillText('打开小程序，查看这个作品', W / 2, 818)
      }
      ctx.setFillStyle('#9CA3AF'); ctx.setFontSize(20); ctx.fillText('作品默认私有，分享由家长主动发起', W / 2, 890)
      ctx.draw(false, () => wx.canvasToTempFilePath({ canvasId: 'detailShareCanvas', width: W, height: H, destWidth: W * 2, destHeight: H * 2, success: r => resolve(r.tempFilePath), fail: reject }, this))
    })
    const loadImage = isArtwork && this.data.mediaUrl
      ? new Promise(resolve => wx.getImageInfo({ src: this.data.mediaUrl, success: r => resolve(r.path), fail: () => resolve('') }))
      : Promise.resolve('')
    const qrcodeUrl = api.getWorkQrcodeUrl(this.data.type, this.data.id)
    const loadQrcode = new Promise(resolve => wx.getImageInfo({ src: qrcodeUrl, success: r => resolve(r.path), fail: err => { console.warn('加载小程序码失败', err, qrcodeUrl); resolve('') } }))
    return Promise.all([loadImage, loadQrcode]).then(([imagePath, qrcodePath]) => draw({ imagePath, qrcodePath }))
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  },

  clipRoundRect(ctx, x, y, w, h, r) { this.roundRect(ctx, x, y, w, h, r); ctx.clip() },

  saveImage(filePath) {
    wx.saveImageToPhotosAlbum({ filePath, success: () => wx.showToast({ title: '已保存', icon: 'success' }), fail: () => wx.showToast({ title: '保存失败，请检查权限', icon: 'none' }) })
  },

  copyShareText() {
    const title = this.data.work.poem_title || this.data.work.poemTitle || '古诗作品'
    const text = this.data.type === 'recitation' ? `我朗读了《${title}》，快来听听吧～` : `我画了《${title}》，快来看看吧～`
    wx.setClipboardData({ data: text })
  },

  onShareAppMessage() {
    const title = this.data.work ? (this.data.work.poem_title || this.data.work.poemTitle || '古诗作品') : '我的古诗作品'
    return {
      title: this.data.type === 'recitation' ? `我朗读了《${title}》` : `我画了《${title}》`,
      path: this.data.id ? `pages/work-detail/work-detail?type=${this.data.type}&id=${this.data.id}` : 'pages/index/index'
    }
  }
})
