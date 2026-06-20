// pages/warehouse/warehouse.js
// 诗园页面
const app = getApp()
const api = require('../../utils/api')
const audioManager = require('../../utils/audio-manager')
const { getAudioCandidates, pickAvailableAudio } = require('../../utils/tts')

Page({
  data: {
    poems: [],
    filteredPoems: [],
    categories: [
      { id: 'all', name: '全部', emoji: '📚', count: 0 },
      { id: 'level1', name: '启蒙', emoji: '🌱', count: 0 },
      { id: 'level2', name: '进阶', emoji: '🌿', count: 0 },
      { id: 'level3', name: '挑战', emoji: '🏔️', count: 0 }
    ],
    seasons: [
      { id: 'spring', name: '春', emoji: '🌸' },
      { id: 'summer', name: '夏', emoji: '☀️' },
      { id: 'autumn', name: '秋', emoji: '🍂' },
      { id: 'winter', name: '冬', emoji: '❄️' }
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
    currentCategory: 'all',
    currentSeason: 'any',
    currentThemeId: '',
    currentThemeName: '',
    themes: [],
    showThemes: false,
    searchKeyword: '',
    childThemeKeyword: '',
    childThemeName: '',
    specialMode: '',
    activeFilterText: '全部',
    showSearch: false,
    stars: 0,
    rankName: '小诗童',
    rankEmoji: '🌱',
    loading: false,
    loadingMore: false,
    backendTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    quickPlayingId: ''
  },

  onLoad() {
    this.pageLoaded = true
    this.skipNextShowFetch = true
    this.applyPendingFilters()
    this.loadThemes()
    this.loadPoems()
    this.loadUserStats()
  },


  onShow() {
    const changed = this.applyPendingFilters()
    this.loadUserStats()
    // onLoad 已经会加载诗词；首次 onShow 不再重复请求，避免开发工具里同时发多次接口导致 timeout。
    if (this.skipNextShowFetch) {
      this.skipNextShowFetch = false
      return
    }
    if (changed) this.fetchPoemsFromBackend()
  },

  applyPendingFilters() {
    const defaultCategory = wx.getStorageSync('warehouseDefaultCategory')
    const keyword = wx.getStorageSync('warehouseSearchKeyword')
    const childThemeKeyword = wx.getStorageSync('warehouseChildThemeKeyword')
    const childThemeName = wx.getStorageSync('warehouseChildThemeName')
    const themeId = wx.getStorageSync('warehouseThemeId')
    const themeName = wx.getStorageSync('warehouseThemeName')
    const specialMode = wx.getStorageSync('warehouseSpecialMode')
    const patch = {}
    let changed = false

    if (defaultCategory) {
      patch.currentCategory = defaultCategory
      changed = changed || this.data.currentCategory !== defaultCategory
      wx.removeStorageSync('warehouseDefaultCategory')
    }

    if (keyword) {
      patch.searchKeyword = keyword
      patch.childThemeKeyword = ''
      patch.childThemeName = ''
      patch.currentThemeId = ''
      patch.currentThemeName = ''
      patch.showSearch = true
      changed = changed || this.data.searchKeyword !== keyword
      wx.removeStorageSync('warehouseSearchKeyword')
    }

    if (childThemeKeyword) {
      patch.childThemeKeyword = childThemeKeyword
      patch.childThemeName = childThemeName || childThemeKeyword
      patch.searchKeyword = ''
      patch.currentThemeId = ''
      patch.currentThemeName = ''
      patch.showSearch = false
      changed = changed || this.data.childThemeKeyword !== childThemeKeyword
      wx.removeStorageSync('warehouseChildThemeKeyword')
      wx.removeStorageSync('warehouseChildThemeName')
    }

    if (themeId) {
      patch.currentThemeId = themeId
      patch.currentThemeName = themeName || ''
      patch.searchKeyword = ''
      patch.childThemeKeyword = ''
      patch.childThemeName = ''
      patch.specialMode = ''
      patch.showThemes = false
      patch.showSearch = false
      changed = changed || this.data.currentThemeId !== themeId
      wx.removeStorageSync('warehouseThemeId')
      wx.removeStorageSync('warehouseThemeName')
    }

    if (specialMode) {
      patch.specialMode = specialMode
      patch.searchKeyword = ''
      patch.childThemeKeyword = ''
      patch.childThemeName = ''
      patch.currentThemeId = ''
      patch.currentThemeName = ''
      patch.showSearch = false
      patch.showThemes = false
      changed = changed || this.data.specialMode !== specialMode
      wx.removeStorageSync('warehouseSpecialMode')
    }

    if (Object.keys(patch).length) {
      patch.activeFilterText = this.buildActiveFilterText(patch)
      this.setData(patch)
    }

    return changed
  },


  loadThemes() {
    api.listThemes()
      .then(res => this.setData({ themes: res.items || [] }))
      .catch(err => console.warn('读取主题失败', err))
  },

  loadPoems() {
    const poems = (app.getPoems && app.getPoems()) || app.globalData.poems || []
    this.setData({ poems, filteredPoems: poems })
    this.updateCategoryCounts(poems)
    this.fetchPoemsFromBackend()
  },

  updateCategoryCounts(poems) {
    const cats = this.data.categories.map(c => {
      if (c.id === 'all') {
        return { ...c, count: poems.length }
      } else {
        const level = parseInt(c.id.replace('level', ''))
        return { ...c, count: poems.filter(p => p.difficulty === level).length }
      }
    })
    this.setData({ categories: cats })
  },

  buildBackendQuery(page = 1) {
    const { currentCategory, currentSeason, currentThemeId, searchKeyword, childThemeKeyword, pageSize } = this.data
    const query = { page, page_size: pageSize }
    const keyword = searchKeyword || childThemeKeyword

    if (currentCategory !== 'all') {
      query.level = parseInt(currentCategory.replace('level', ''))
    }

    if (currentSeason !== 'any') {
      query.season = currentSeason
    }

    if (currentThemeId) {
      query.theme = currentThemeId
    }

    if (keyword) {
      query.keyword = keyword
    }

    return query
  },

  fetchPoemsFromBackend(page = 1, append = false) {
    if (!api.config.useBackendPoems) {
      this.filterPoems()
      return Promise.resolve()
    }

    if (this.data.loading || this.data.loadingMore) return Promise.resolve()
    if (append && !this.data.hasMore) return Promise.resolve()

    this.setData(append ? { loadingMore: true } : { loading: true, page: 1, hasMore: true })
    return api.listPoems(this.buildBackendQuery(page))
      .then(res => {
        const rawItems = res.items || []
        const items = this.applySpecialModeFilter(rawItems)
        const nextPoems = append ? this.data.filteredPoems.concat(items) : items
        const total = this.data.specialMode ? nextPoems.length : (res.total || nextPoems.length)
        const hasMore = this.data.specialMode
          ? rawItems.length >= this.data.pageSize
          : nextPoems.length < total && rawItems.length > 0

        this.setData({
          filteredPoems: nextPoems,
          backendTotal: total,
          page,
          hasMore,
          loading: false,
          loadingMore: false
        })

        if (!append && this.data.currentCategory === 'all' && this.data.currentSeason === 'any' && !this.data.currentThemeId && !this.data.searchKeyword && !this.data.childThemeKeyword && !this.data.specialMode) {
          this.setData({ poems: nextPoems })
          this.updateCategoryCounts(nextPoems)
        }
      })
      .catch(err => {
        console.warn('后端筛选失败，使用本地筛选', err)
        this.setData({ loading: false, loadingMore: false })
        this.filterPoems()
      })
  },

  loadMorePoems() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return
    this.fetchPoemsFromBackend(this.data.page + 1, true)
  },

  onReachBottom() {
    this.loadMorePoems()
  },

  loadUserStats() {
    api.getStats()
      .then(stats => {
        const stars = stats.stars || 0
        const rank = this.getRank(stars)
        this.setData({
          stars,
          rankName: rank.name,
          rankEmoji: rank.emoji
        })
      })
      .catch(err => console.warn('读取用户诗光失败', err))
  },

  getRank(stars) {
    const ranks = [
      { minStars: 0, name: '小诗童', emoji: '🌱' },
      { minStars: 50, name: '小诗迷', emoji: '🌿' },
      { minStars: 150, name: '小诗人', emoji: '🌳' },
      { minStars: 400, name: '诗童', emoji: '🎋' },
      { minStars: 800, name: '诗人', emoji: '📜' },
      { minStars: 1500, name: '诗仙', emoji: '✨' },
      { minStars: 3000, name: '大诗仙', emoji: '🌟' },
      { minStars: 6000, name: '诗神', emoji: '🏆' }
    ]
    let current = ranks[0]
    for (const r of ranks) {
      if (stars >= r.minStars) current = r
      else break
    }
    return current
  },

  switchCategory(e) {
    const cat = e.currentTarget.dataset.cat
    const patch = { currentCategory: cat }
    patch.activeFilterText = this.buildActiveFilterText(patch)
    this.setData(patch)
    this.fetchPoemsFromBackend()
  },

  buildActiveFilterText(patch = {}) {
    const data = { ...this.data, ...patch }
    const parts = []
    const cat = data.categories.find(c => c.id === data.currentCategory)
    parts.push(cat && data.currentCategory !== 'all' ? cat.name : '全部')

    if (data.specialMode === 'follow') {
      parts.push('跟读练习')
    }

    if (data.searchKeyword) {
      parts.push(`搜索“${data.searchKeyword}”`)
    } else if (data.childThemeKeyword) {
      parts.push(data.childThemeName || data.childThemeKeyword)
    } else if (data.currentThemeName) {
      parts.push(data.currentThemeName)
    }

    if (data.currentSeason !== 'any') {
      const season = data.seasons.find(s => s.id === data.currentSeason)
      if (season) parts.push(season.name)
    }

    return parts.join(' · ')
  },

  hasFollowAudio(poem) {
    return !!(poem && (poem.audio || poem.localAudio || poem.audioUrl || poem.followTimings))
  },

  applySpecialModeFilter(items) {
    if (this.data.specialMode === 'follow') {
      return (items || []).filter(p => this.hasFollowAudio(p))
    }
    return items || []
  },

  filterPoems() {
    const { poems, currentCategory, currentSeason, currentThemeId, searchKeyword, childThemeKeyword } = this.data
    let filtered = poems
    const keyword = searchKeyword || childThemeKeyword

    if (currentCategory !== 'all') {
      const level = parseInt(currentCategory.replace('level', ''))
      filtered = filtered.filter(p => p.difficulty === level)
    }

    if (currentSeason !== 'any') {
      filtered = filtered.filter(p => p.season === currentSeason || p.season === 'any')
    }

    if (currentThemeId) {
      filtered = filtered.filter(p => (p.theme_ids || []).includes(currentThemeId))
    }

    if (keyword) {
      const kw = keyword.toLowerCase()
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(kw) ||
        p.author.toLowerCase().includes(kw) ||
        p.content.toLowerCase().includes(kw) ||
        (p.tags || []).join(',').toLowerCase().includes(kw)
      )
    }

    filtered = this.applySpecialModeFilter(filtered)

    this.setData({ filteredPoems: filtered })
  },


  toggleThemes() {
    this.setData({ showThemes: !this.data.showThemes })
  },

  switchTheme(e) {
    const { id, name } = e.currentTarget.dataset
    const nextId = this.data.currentThemeId === id ? '' : id
    const patch = {
      currentThemeId: nextId,
      currentThemeName: nextId ? name : '',
      searchKeyword: '',
      childThemeKeyword: '',
      childThemeName: '',
      specialMode: '',
      showSearch: false,
      showThemes: false
    }
    patch.activeFilterText = this.buildActiveFilterText(patch)
    this.setData(patch)
    this.fetchPoemsFromBackend()
  },

  switchChildTheme(e) {
    const { keyword, name } = e.currentTarget.dataset
    const nextKeyword = this.data.childThemeKeyword === keyword ? '' : keyword
    const patch = {
      childThemeKeyword: nextKeyword,
      childThemeName: nextKeyword ? (name || keyword) : '',
      searchKeyword: '',
      specialMode: '',
      showSearch: false,
      currentThemeId: '',
      currentThemeName: '',
      showThemes: false
    }
    patch.activeFilterText = this.buildActiveFilterText(patch)
    this.setData(patch)
    this.fetchPoemsFromBackend()
  },

  clearAllFilters() {
    this.setData({
      currentCategory: 'all',
      currentSeason: 'any',
      currentThemeId: '',
      currentThemeName: '',
      searchKeyword: '',
      childThemeKeyword: '',
      childThemeName: '',
      specialMode: '',
      activeFilterText: '全部',
      showSearch: false
    })
    this.fetchPoemsFromBackend()
  },

  clearTheme() {
    const patch = { currentThemeId: '', currentThemeName: '' }
    patch.activeFilterText = this.buildActiveFilterText(patch)
    this.setData(patch)
    this.fetchPoemsFromBackend()
  },

  onSeasonChange(e) {
    const season = e.currentTarget.dataset.season
    const patch = { currentSeason: season }
    patch.activeFilterText = this.buildActiveFilterText(patch)
    this.setData(patch)
    this.fetchPoemsFromBackend()
  },

  toggleSearch() {
    const nextShowSearch = !this.data.showSearch
    const patch = { showSearch: nextShowSearch }
    if (!nextShowSearch) {
      patch.searchKeyword = ''
      patch.activeFilterText = this.buildActiveFilterText(patch)
    }
    this.setData(patch)
    if (!nextShowSearch) this.fetchPoemsFromBackend()
  },

  onSearchInput(e) {
    const keyword = e.detail.value
    const patch = {
      searchKeyword: keyword,
      childThemeKeyword: '',
      childThemeName: '',
      currentThemeId: '',
      currentThemeName: '',
      specialMode: '',
      showThemes: false
    }
    patch.activeFilterText = this.buildActiveFilterText(patch)
    this.setData(patch)
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.fetchPoemsFromBackend()
    }, 300)
  },

  goToLearn(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/learn/learn?id=${id}&type=poem`
    })
  },

  findPoemById(id) {
    return (this.data.filteredPoems || []).find(p => Number(p.id) === Number(id)) ||
      (this.data.poems || []).find(p => Number(p.id) === Number(id))
  },

  async playPoemQuick(e) {
    const { id } = e.currentTarget.dataset
    const poem = this.findPoemById(id)
    if (!poem) return
    const candidates = getAudioCandidates('poem', poem)
    const audioPath = await pickAvailableAudio(candidates)
    if (!audioPath) {
      wx.showToast({ title: '暂无音频', icon: 'none' })
      return
    }
    if (this.quickAudio && this.data.quickPlayingId === id) {
      try { this.quickAudio.stop() } catch (err) {}
      this.setData({ quickPlayingId: '' })
      return
    }
    if (this.quickAudio) {
      try { this.quickAudio.destroy() } catch (err) {}
      this.quickAudio = null
    }
    this.quickAudio = audioManager.create('warehouse-quick-poem')
    this.quickAudio.onEnded(() => this.setData({ quickPlayingId: '' }))
    this.quickAudio.onStop(() => this.setData({ quickPlayingId: '' }))
    this.quickAudio.onError(() => {
      this.setData({ quickPlayingId: '' })
      wx.showToast({ title: '播放失败', icon: 'none' })
    })
    this.quickAudio.src = audioPath
    this.setData({ quickPlayingId: id })
    this.quickAudio.play()
  },

  followPoemQuick(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/learn/learn?id=${id}&type=poem&follow=1` })
  },

  markPoemQuick(e) {
    const { id } = e.currentTarget.dataset
    wx.showLoading({ title: '同步中...' })
    api.listProgress()
      .catch(() => [])
      .then(items => {
        const current = (items || []).find(item => Number(item.poem_id || item.poemId) === Number(id))
        const task = current && current.learned
          ? { id: 'review3', stars: 2, toast: '今日复习完成' }
          : { id: 'learn1', stars: 3, toast: '今日学习完成' }
        return api.updateProgress(id, { learned: true })
          .then(() => api.completeTask(task.id, task.stars))
          .then(res => ({ task, res }))
      })
      .then(({ task, res }) => {
        wx.hideLoading()
        const added = res && typeof res.stars_added === 'number' ? res.stars_added : 0
        wx.showToast({
          title: added > 0 ? `${task.toast} +${added}✨` : '今天已获得过诗光啦',
          icon: 'none',
          duration: 1800
        })
        this.loadUserStats()
      })
      .catch(err => {
        wx.hideLoading()
        console.warn('快捷标记学会失败', err)
        wx.showToast({ title: '同步失败', icon: 'none' })
      })
  },

  onHide() {
    audioManager.stopAll()
  },

  onUnload() {
    audioManager.destroyAll()
  },

  // 诗光由后端 user_stats 维护
  getStars() {
    this.loadUserStats()
  }
})