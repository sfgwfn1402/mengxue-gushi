const api = require('../../utils/api')
const audioManager = require('../../utils/audio-manager')
const audioCache = require('../../utils/audio-cache')

Page({
  data: {
    tab: 'recitations',
    loading: false,
    items: [],
    formatTimeMap: {},
    playingId: '',
    statusTextMap: {
      active: '私有',
      submitted: '已发布',
      public: '已公开',
      rejected: '未通过'
    }
  },

  onLoad(options) {
    if (options && options.tab) this.setData({ tab: options.tab })
  },

  onShow() {
    this.loadWorks()
  },

  onUnload() {
    this.stopAudio()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.tab) return
    this.stopAudio()
    this.setData({ tab, items: [], playingId: '' })
    this.loadWorks()
  },

  loadWorks() {
    this.setData({ loading: true })
    const req = this.data.tab === 'recitations'
      ? Promise.all([api.listMyRecitations({ limit: 100 }), api.listPoems({ page: 1, page_size: 500 })])
          .then(([res, poems]) => this.attachPoemTitles(res, poems))
      : api.listArtworks({ mine: true, limit: 100 })
    req.then(res => {
      const items = res.items || []
      const formatTimeMap = {}
      items.forEach(item => { formatTimeMap[item.id] = this.formatDate(item.created_at || item.createdAt) })
      this.setData({ items, formatTimeMap, loading: false })
    }).catch(err => {
      console.warn('读取作品失败', err)
      this.setData({ loading: false, items: [] })
      wx.showToast({ title: '读取作品失败', icon: 'none' })
    })
  },

  attachPoemTitles(res, poems) {
    const poemMap = {}
    ;(poems.items || []).forEach(poem => { poemMap[Number(poem.id)] = poem })
    const items = (res.items || []).map(item => {
      const poem = poemMap[Number(item.poem_id || item.poemId)]
      if (!poem) return item
      return Object.assign({}, item, {
        poem_title: poem.title,
        poem_author: poem.author,
        poem_dynasty: poem.dynasty
      })
    })
    return Object.assign({}, res, { items })
  },

  formatDate(value) {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
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

  async playRecitation(e) {
    const id = e.currentTarget.dataset.id
    const url = `${api.config.apiBaseUrl}/recitations/${id}/audio`
    if (!url) {
      wx.showToast({ title: '没有音频地址', icon: 'none' })
      return
    }
    if (this.data.playingId === id) {
      this.stopAudio()
      return
    }
    this.stopAudio()
    let audioPath = url
    wx.showLoading({ title: '加载音频...' })
    try {
      audioPath = await audioCache.downloadAndCache(url, { tag: 'recitation-audio' })
    } catch (err) {
      console.warn('作品朗读缓存失败，尝试直接播放远程 URL', err, url)
      audioPath = url
    }
    wx.hideLoading()
    this.audio = audioManager.create('works-recitation')
    this.audio.obeyMuteSwitch = false
    this.audio.onEnded(() => this.setData({ playingId: '' }))
    this.audio.onStop(() => this.setData({ playingId: '' }))
    this.audio.onError(err => {
      const msg = err && err.errMsg ? err.errMsg : String(err || '')
      console.warn('作品朗读回听失败', err, audioPath)
      this.setData({ playingId: '' })
      wx.showToast({ title: msg.includes('background') || msg.includes('no permission') ? '请回到小程序前台播放' : '播放失败', icon: 'none' })
    })
    this.audio.src = audioPath
    this.setData({ playingId: id })
    audioManager.play(this.audio)
  },

  stopAudio() {
    if (this.audio) {
      try { audioManager.ignoreAudioPromise(this.audio.stop && this.audio.stop()) } catch (e) {}
      try { audioManager.ignoreAudioPromise(this.audio.destroy && this.audio.destroy()) } catch (e) {}
      this.audio = null
    }
    this.setData({ playingId: '' })
  },

  openDetail(e) {
    const index = Number(e.currentTarget.dataset.index || 0)
    const item = this.data.items[index]
    if (!item) return
    const type = this.data.tab === 'recitations' ? 'recitation' : 'artwork'
    wx.setStorageSync('currentWorkDetail', { id: item.id, type, item })
    wx.navigateTo({ url: `/pages/work-detail/work-detail?type=${type}&id=${item.id}` })
  },

  previewArtwork(e) {
    const url = this.normalizeMediaUrl(e.currentTarget.dataset.url)
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },

  openMoreMenu(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const item = this.data.items.find(x => String(x.id) === String(id)) || {}
    const status = item.status || 'active'
    const canWithdraw = status === 'submitted' || status === 'public'
    const itemList = [canWithdraw ? '撤回公开' : '发布到发现', '删除作品']
    wx.showActionSheet({
      itemList,
      itemColor: '#DC2626',
      success: res => {
        if (res.tapIndex === 0) {
          canWithdraw ? this.withdrawWork(id) : this.submitWork(id)
        }
        if (res.tapIndex === 1) this.confirmDeleteWork(id)
      }
    })
  },

  submitWork(id) {
    wx.showModal({
      title: '发布到发现？',
      content: '发布后，其他用户可以在发现中看到/听到这个作品。',
      confirmText: '发布',
      success: res => {
        if (!res.confirm) return
        const req = this.data.tab === 'recitations' ? api.submitRecitation(id) : api.submitArtwork(id)
        req.then(() => { wx.showToast({ title: '已发布到发现', icon: 'success' }); this.loadWorks() })
          .catch(err => { console.warn('发布失败', err); wx.showToast({ title: '发布失败', icon: 'none' }) })
      }
    })
  },

  withdrawWork(id) {
    const req = this.data.tab === 'recitations' ? api.withdrawRecitation(id) : api.withdrawArtwork(id)
    req.then(() => { wx.showToast({ title: '已撤回', icon: 'success' }); this.loadWorks() })
      .catch(err => { console.warn('撤回失败', err); wx.showToast({ title: '撤回失败', icon: 'none' }) })
  },

  deleteWork(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.confirmDeleteWork(id)
  },

  confirmDeleteWork(id) {
    wx.showModal({
      title: '删除作品？',
      content: '删除后不会在我的诗集中显示。',
      confirmText: '删除',
      confirmColor: '#DC2626',
      success: res => {
        if (!res.confirm) return
        const req = this.data.tab === 'recitations' ? api.deleteRecitation(id) : api.deleteArtwork(id)
        req.then(() => {
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadWorks()
        }).catch(err => {
          console.warn('删除作品失败', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        })
      }
    })
  },

  openShareMenu(e) {
    const index = Number(e.currentTarget.dataset.index || 0)
    const item = this.data.items[index]
    if (!item) return
    wx.showActionSheet({
      itemList: ['生成分享卡', '复制分享文案'],
      success: res => {
        if (res.tapIndex === 0) this.makeShareCard({ currentTarget: { dataset: { index } } })
        if (res.tapIndex === 1) this.copyShareText(item)
      }
    })
  },

  makeShareCard(e) {
    const item = this.data.items[e.currentTarget.dataset.index]
    if (!item) return
    wx.showLoading({ title: '生成卡片…' })
    this.drawShareCard(item)
      .then(filePath => {
        wx.hideLoading()
        wx.showActionSheet({
          itemList: ['预览卡片', '保存到相册', '复制分享文案'],
          success: res => {
            if (res.tapIndex === 0) wx.previewImage({ urls: [filePath], current: filePath })
            if (res.tapIndex === 1) this.saveImage(filePath)
            if (res.tapIndex === 2) this.copyShareText(item)
          }
        })
      })
      .catch(err => {
        wx.hideLoading()
        console.warn('生成分享卡片失败', err)
        wx.showToast({ title: '生成失败', icon: 'none' })
      })
  },

  drawShareCard(item) {
    const isArtwork = this.data.tab === 'artworks'
    const poemTitle = item.poem_title || item.poemTitle || '古诗作品'
    const workTitle = item.title || (isArtwork ? '我的诗配画' : '我的朗读')
    const date = (this.data.formatTimeMap && this.data.formatTimeMap[item.id]) || ''
    const artworkUrl = isArtwork ? this.normalizeMediaUrl(item.image_url || item.imageUrl) : ''

    const draw = (imagePath) => new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext('shareCanvas', this)
      const W = 600
      const H = 900
      ctx.setFillStyle('#FFF8DF')
      ctx.fillRect(0, 0, W, H)
      const grd = ctx.createLinearGradient(0, 0, W, 240)
      grd.addColorStop(0, '#FFD76A')
      grd.addColorStop(1, '#FF8A65')
      ctx.setFillStyle(grd)
      ctx.fillRect(0, 0, W, 240)

      ctx.setFillStyle('#5B3300')
      ctx.setFontSize(34)
      ctx.setTextAlign('center')
      ctx.fillText('萌学古诗 · 我的小诗集', W / 2, 62)
      ctx.setFontSize(52)
      ctx.fillText(`《${poemTitle}》`, W / 2, 135)
      ctx.setFontSize(26)
      ctx.fillText(isArtwork ? '我画下的诗意' : '我读出的诗意', W / 2, 188)

      ctx.setFillStyle('#FFFFFF')
      this.roundRect(ctx, 42, 270, 516, 360, 28)
      ctx.fill()

      if (imagePath) {
        ctx.save()
        this.clipRoundRect(ctx, 62, 290, 476, 320, 22)
        ctx.drawImage(imagePath, 62, 290, 476, 320)
        ctx.restore()
      } else {
        ctx.setFillStyle('#EEF6FF')
        this.roundRect(ctx, 62, 290, 476, 320, 22)
        ctx.fill()
        ctx.setFontSize(92)
        ctx.setTextAlign('center')
        ctx.fillText('🎙️', W / 2, 420)
        ctx.setFillStyle('#2563EB')
        ctx.setFontSize(34)
        ctx.fillText('点击小程序入口听我的朗读', W / 2, 500)
      }

      ctx.setFillStyle('#2F2A1F')
      ctx.setTextAlign('center')
      ctx.setFontSize(34)
      ctx.fillText(workTitle, W / 2, 690)
      ctx.setFillStyle('#8A6B2E')
      ctx.setFontSize(24)
      ctx.fillText(date ? `完成于 ${date}` : '我的古诗成长作品', W / 2, 732)

      ctx.setFillStyle('#FFFFFF')
      this.roundRect(ctx, 72, 770, 456, 76, 38)
      ctx.fill()
      ctx.setFillStyle('#FF6B4A')
      ctx.setFontSize(28)
      ctx.fillText('打开小程序，查看作品入口', W / 2, 818)

      ctx.setFillStyle('#9CA3AF')
      ctx.setFontSize(20)
      ctx.fillText('作品默认私有，分享由家长主动发起', W / 2, 870)

      ctx.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: 'shareCanvas',
          width: W,
          height: H,
          destWidth: W * 2,
          destHeight: H * 2,
          success: res => resolve(res.tempFilePath),
          fail: reject
        }, this)
      })
    })

    if (!artworkUrl) return draw('')
    return new Promise(resolve => {
      wx.getImageInfo({ src: artworkUrl, success: res => resolve(res.path), fail: () => resolve('') })
    }).then(draw)
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },

  clipRoundRect(ctx, x, y, w, h, r) {
    this.roundRect(ctx, x, y, w, h, r)
    ctx.clip()
  },

  saveImage(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => wx.showToast({ title: '已保存', icon: 'success' }),
      fail: err => {
        console.warn('保存卡片失败', err)
        wx.showToast({ title: '保存失败，请检查相册权限', icon: 'none' })
      }
    })
  },

  copyShareText(item) {
    const title = item.poem_title || item.poemTitle || '古诗作品'
    const text = this.data.tab === 'recitations'
      ? `我朗读了《${title}》，快来听听我的小诗人作品吧～`
      : `我画了《${title}》诗配画，快来看看我的小诗集吧～`
    wx.setClipboardData({ data: text })
  },

  onShareAppMessage(e) {
    const index = e && e.target ? Number(e.target.dataset.index || 0) : 0
    const item = this.data.items[index] || {}
    const title = item.poem_title || item.poemTitle || '我的古诗作品'
    const type = this.data.tab === 'recitations' ? 'recitation' : 'artwork'
    return {
      title: this.data.tab === 'recitations' ? `我朗读了《${title}》` : `我画了《${title}》`,
      path: item.id ? `pages/work-detail/work-detail?type=${type}&id=${item.id}` : `pages/works/works?tab=${this.data.tab}`
    }
  }
})
