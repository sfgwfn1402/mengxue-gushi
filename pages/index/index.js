// pages/index/index.js
const app = getApp()
const api = require('../../utils/api')
const audioManager = require('../../utils/audio-manager')
const audioCache = require('../../utils/audio-cache')

Page({
  data: {
    themes: [],
    totalPoems: 0,
    todayPoem: null,
    lastPoem: null,
    recommendedPoems: [],
    recommendReason: '',
    recommendShortReason: '猜你喜欢',
    popularRecitations: [],
    learningPaths: [
      { id: 'must', emoji: '📖', title: '启蒙必背', desc: '从最简单的诗开始', category: 'level1' },
      { id: 'follow', emoji: '🎙️', title: '跟读练习', desc: '听一句，读一句', mode: 'follow' },
      { id: 'spring', emoji: '🌸', title: '春天的诗', desc: '花开、鸟鸣和春风', keyword: '春天' },
      { id: 'animal', emoji: '🦢', title: '小动物的诗', desc: '鹅、鸟、鱼和蝉', keyword: '动物' }
    ],
    childThemes: [
      { emoji: '🌸', name: '春天', keyword: '春天' },
      { emoji: '🦢', name: '动物', keyword: '动物' },
      { emoji: '⛰️', name: '山水', keyword: '山水' },
      { emoji: '🌙', name: '思乡', keyword: '思乡' },
      { emoji: '❤️', name: '亲情', keyword: '亲情' },
      { emoji: '👋', name: '送别', keyword: '送别' },
      { emoji: '🔥', name: '励志', keyword: '励志' },
      { emoji: '🎐', name: '节日', keyword: '节日' }
    ],
    dailyTasks: [
      { emoji: '👂', title: '听一首诗', desc: '先听官方朗读，感受古诗的节奏' },
      { emoji: '🎙️', title: '跟读一首诗', desc: '一句一句练，像小诗人一样读出来' },
      { emoji: '🌱', title: '读懂一首诗', desc: '看看画面和讲解，和孩子聊一聊' }
    ],
    dataSource: '本地数据',
    backendError: '',
    playingRecitationId: '',
    homeTab: 'learn',
    discoverFilter: 'all',
    discoverItems: [],
    visibleDiscoverItems: [],
    discoverPage: 1,
    discoverPageSize: 10,
    discoverLoading: false,
    discoverHasMore: true
  },

  onLoad() {
    this.refreshList()
    this.loadHomeData()
  },

  onShow() {
    if (this._loadedOnce) return
    this._loadedOnce = true
  },

  refreshList() {
    const poems = (app.getPoems && app.getPoems()) || []
    const lastPoem = wx.getStorageSync('lastLearnPoem') || null
    this.setData({
      totalPoems: poems.length,
      lastPoem,
      dataSource: app.globalData.poemsLoadedFromBackend ? '后端数据库' : '服务维护中',
      backendError: app.globalData.backendError || ''
    })
  },

  pickTodayPoem(poems, progressItems) {
    if (!poems.length) return null
    const learnedIds = new Set((progressItems || [])
      .filter(item => !!item.learned)
      .map(item => Number(item.poem_id || item.poemId)))
    const candidates = poems.filter(p => !learnedIds.has(Number(p.id)))
    const pool = candidates.length ? candidates : poems
    const dayIndex = Math.floor(Date.now() / 86400000) % pool.length
    return pool[dayIndex] || pool[0] || null
  },

  pickLastPoem(poems, progressItems) {
    const poemMap = {}
    poems.forEach(p => { poemMap[Number(p.id)] = p })
    const latest = (progressItems || [])
      .filter(item => item.last_learned_at && poemMap[Number(item.poem_id || item.poemId)])
      .sort((a, b) => String(b.last_learned_at).localeCompare(String(a.last_learned_at)))[0]
    if (latest) return poemMap[Number(latest.poem_id || latest.poemId)]
    const cached = wx.getStorageSync('lastLearnPoem') || null
    return cached && poemMap[Number(cached.id)] ? poemMap[Number(cached.id)] : cached
  },

  applyHomePoems(poems, progressItems) {
    const todayPoem = this.pickTodayPoem(poems, progressItems)
    const lastPoem = this.pickLastPoem(poems, progressItems)
    this.setData({
      totalPoems: poems.length,
      todayPoem,
      lastPoem,
      dataSource: '后端数据库',
      backendError: ''
    })
  },

  loadHomeData() {
    // 域名 HTTPS 入口偶发 reset 时，首屏并发越高越容易丢请求；分批加载更稳。
    this.forceRefreshBackend()
    setTimeout(() => this.loadThemes(), 120)
    setTimeout(() => this.loadRecommendations(), 260)
    setTimeout(() => this.loadPopularRecitations(), 420)
    setTimeout(() => this.loadDiscoverItems(), 650)
  },

  forceRefreshBackend() {
    if (!api.config.useBackendPoems) return
    api.login()
      .then(() => Promise.all([
        api.getTodayPoem(),
        api.getContinueLearning()
      ]))
      .then(([todayPoem, continuePoem]) => {
        app.globalData.poemsLoadedFromBackend = true
        app.globalData.backendError = ''
        this.setData({
          todayPoem,
          lastPoem: continuePoem || wx.getStorageSync('lastLearnPoem') || null,
          dataSource: '后端数据库',
          backendError: ''
        })
      })
      .catch(err => {
        app.globalData.poems = []
        app.globalData.backendError = err.message || String(err)
        app.globalData.poemsLoadedFromBackend = false
        this.refreshList()
        console.warn('[萌学古诗] 首页刷新后端数据失败', err)
      })
  },

  loadThemes() {
    api.listThemes()
      .then(res => {
        const themes = res.items || []
        this.setData({ themes })
      })
      .catch(err => console.warn('读取主题失败', err))
  },

  loadRecommendations() {
    api.getHomeRecommendations()
      .then(res => {
        const themeName = res.theme && res.theme.name ? res.theme.name : ''
        this.setData({
          recommendedPoems: res.items || [],
          recommendReason: res.reason || '',
          recommendShortReason: themeName ? `${res.theme.emoji || ''} ${themeName}` : '猜你喜欢'
        })
      })
      .catch(err => console.warn('读取首页推荐失败', err))
  },

  loadPopularRecitations() {
    api.getPopularRecitations()
      .then(res => this.setData({ popularRecitations: res.items || [] }))
      .catch(err => console.warn('读取人气朗诵失败', err))
  },

  switchHomeTab(e) {
    const tab = e.currentTarget.dataset.tab || 'learn'
    this.setData({ homeTab: tab })
    if (tab === 'discover') this.loadDiscoverItems({ reset: true })
  },

  switchDiscoverFilter(e) {
    const discoverFilter = e.currentTarget.dataset.filter || 'all'
    this.setData({ discoverFilter, visibleDiscoverItems: this.filterDiscoverItems(this.data.discoverItems, discoverFilter) })
  },

  loadDiscoverItems(options) {
    const reset = !!(options && options.reset)
    if (this.data.discoverLoading) return
    if (!reset && !this.data.discoverHasMore) return

    const page = reset ? 1 : this.data.discoverPage
    const limit = this.data.discoverPageSize
    this.setData({ discoverLoading: true })

    Promise.all([
      api.listArtworks({ limit, page }).catch(() => ({ items: [] })),
      api.getPopularRecitations({ limit, page }).catch(() => ({ items: [] }))
    ])
      .then(([artRes, recRes]) => {
        const artworkRaw = artRes.items || []
        const recitationRaw = recRes.items || []
        const artworks = artworkRaw.map(item => ({
          id: item.id,
          type: 'artwork',
          title: item.title || '我的诗配画',
          imageUrl: item.image_url,
          poemTitle: item.poem_title || '',
          nickname: item.nickname || '小诗童',
          avatarUrl: item.avatar_url || '',
          likeCount: item.like_count || 0,
          likedByMe: !!item.liked_by_me,
          createdAt: item.created_at || ''
        }))
        const recitations = recitationRaw.map(item => ({
          id: item.recitation && item.recitation.id,
          type: 'recitation',
          title: `朗诵《${item.poem_title || '古诗'}》`,
          poemTitle: item.poem_title || '',
          nickname: (item.recitation && item.recitation.nickname) || '小诗童',
          avatarUrl: (item.recitation && item.recitation.avatar_url) || '',
          likeCount: (item.recitation && item.recitation.like_count) || 0,
          likedByMe: !!(item.recitation && item.recitation.liked_by_me),
          createdAt: (item.recitation && item.recitation.created_at) || ''
        })).filter(item => item.id)
        const incomingItems = artworks.concat(recitations)
        const itemMap = {}
        ;(reset ? [] : this.data.discoverItems).concat(incomingItems).forEach(item => {
          itemMap[`${item.type}:${item.id}`] = item
        })
        const discoverItems = Object.keys(itemMap).map(key => itemMap[key])
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        const hasMore = artworkRaw.length >= limit || recitationRaw.length >= limit
        this.setData({
          discoverItems,
          visibleDiscoverItems: this.filterDiscoverItems(discoverItems, this.data.discoverFilter),
          discoverPage: page + 1,
          discoverHasMore: hasMore,
          discoverLoading: false
        })
      })
      .catch(err => {
        console.warn('读取发现作品失败', err)
        this.setData({ discoverLoading: false })
      })
  },

  onReachBottom() {
    if (this.data.homeTab === 'discover') this.loadDiscoverItems()
  },

  filterDiscoverItems(items, filter) {
    return filter === 'all' ? items : items.filter(item => item.type === filter)
  },

  playDiscoverRecitation(e) {
    this.playPopularRecitation(e)
  },

  toggleDiscoverLike(e) {
    const { id, type } = e.currentTarget.dataset
    if (!id || !type) return
    const current = this.data.discoverItems.find(item => item.id === id && item.type === type)
    if (!current) return
    const action = current.likedByMe
      ? (type === 'artwork' ? api.unlikeArtwork(id) : api.unlikeRecitation(id))
      : (type === 'artwork' ? api.likeArtwork(id) : api.likeRecitation(id))

    action.then(res => {
      const discoverItems = this.data.discoverItems.map(item => {
        if (item.id !== id || item.type !== type) return item
        return {
          ...item,
          likedByMe: !!res.liked,
          likeCount: typeof res.like_count === 'number' ? res.like_count : item.likeCount
        }
      })
      this.setData({
        discoverItems,
        visibleDiscoverItems: this.filterDiscoverItems(discoverItems, this.data.discoverFilter)
      })
    }).catch(err => {
      console.warn('发现作品点赞失败', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },


  goToLearn(e) {
    const { id, type } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/learn/learn?id=${id}&type=${type || 'poem'}` })
  },


  openLearningPath(e) {
    const { keyword, category, mode } = e.currentTarget.dataset
    wx.setStorageSync('warehouseDefaultCategory', category || 'all')
    wx.removeStorageSync('warehouseSearchKeyword')
    wx.removeStorageSync('warehouseChildThemeKeyword')
    wx.removeStorageSync('warehouseChildThemeName')
    wx.removeStorageSync('warehouseThemeId')
    wx.removeStorageSync('warehouseThemeName')
    wx.removeStorageSync('warehouseSpecialMode')
    if (keyword) wx.setStorageSync('warehouseChildThemeKeyword', keyword)
    if (mode) wx.setStorageSync('warehouseSpecialMode', mode)
    wx.switchTab({ url: '/pages/warehouse/warehouse' })
  },

  openThemeKeyword(e) {
    const { keyword, name } = e.currentTarget.dataset
    wx.setStorageSync('warehouseDefaultCategory', 'all')
    wx.setStorageSync('warehouseChildThemeKeyword', keyword)
    wx.setStorageSync('warehouseChildThemeName', name || keyword)
    wx.switchTab({ url: '/pages/warehouse/warehouse' })
  },

  openWarehouse() {
    wx.switchTab({ url: '/pages/warehouse/warehouse' })
  },

  openChallenge() {
    wx.switchTab({ url: '/pages/challenge/challenge' })
  },

  openDailyTask(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({ url: `/pages/learn/learn?id=${id}&type=poem` })
      return
    }
    this.openWarehouse()
  },

  async playPopularRecitation(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    const url = `${api.config.apiBaseUrl}/recitations/${id}/audio`
    if (this.data.playingRecitationId === id && this.audio) {
      this.audio.stop()
      this.setData({ playingRecitationId: '' })
      return
    }
    if (this.audio) {
      try { this.audio.destroy() } catch (e) {}
      this.audio = null
    }
    let audioPath = url
    wx.showLoading({ title: '加载音频...' })
    try {
      audioPath = await audioCache.downloadAndCache(url, { tag: 'recitation-audio' })
    } catch (err) {
      console.warn('人气朗诵缓存失败，尝试直接播放远程 URL', err, url)
      audioPath = url
    }
    wx.hideLoading()
    this.audio = audioManager.create('index-popular-recitation')
    this.audio.onEnded(() => this.setData({ playingRecitationId: '' }))
    this.audio.onStop(() => this.setData({ playingRecitationId: '' }))
    this.audio.onError(err => {
      console.warn('播放人气朗诵失败', err)
      this.setData({ playingRecitationId: '' })
      wx.showToast({ title: '播放失败', icon: 'none' })
    })
    this.audio.src = audioPath
    this.setData({ playingRecitationId: id })
    setTimeout(() => {
      if (this.audio && this.data.playingRecitationId === id) {
        audioManager.playWithRetry(this.audio, {
          attempts: 4,
          delay: 260,
          shouldContinue: () => !!this.audio && this.data.playingRecitationId === id
        })
      }
    }, 120)
  },

  onHide() {
    audioManager.stopAll()
  },

  onUnload() {
    audioManager.destroyAll()
    if (this.audio) {
      this.audio.destroy()
      this.audio = null
    }
  }
})
