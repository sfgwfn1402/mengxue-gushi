// pages/index/index.js
const app = getApp()
const api = require('../../utils/api')
const { track } = require('../../utils/track')
const audioManager = require('../../utils/audio-manager')
const audioCache = require('../../utils/audio-cache')
const onboarding = require('../../utils/onboarding')
const { getPoemImageUrl, isPoemAudioPending } = require('../../utils/tts')

function pad2(n) { return n < 10 ? '0' + n : '' + n }
function localDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
function parseServerTime(s) {
  if (!s) return null
  const t = new Date(String(s).replace(' ', 'T') + 'Z')
  return isNaN(t.getTime()) ? null : t
}
function isToday(s) {
  const t = parseServerTime(s)
  return !!t && localDateStr(t) === localDateStr(new Date())
}
function daysSince(s) {
  const t = parseServerTime(s)
  if (!t) return 9999
  return Math.floor((Date.now() - t.getTime()) / 86400000)
}

const REVIEW_INTERVAL_DAYS = 2
const PLAN_REVIEW_CAP = 2

function formatDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  if (!s) return ''
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r < 10 ? '0' : ''}${r}`
}

Page({
  data: {
    themes: [],
    totalPoems: 0,
    todayPoem: null,
    recommendedPoems: [],
    recommendReason: '',
    recommendShortReason: '猜你喜欢',
    popularRecitations: [],
    learningPaths: [
      { id: 'must', emoji: '📖', title: '启蒙必背', desc: '从最简单的诗开始', action: 'category', category: 'level1' },
      { id: 'follow', emoji: '🎙️', title: '跟读练习', desc: '听一句，读一句', action: 'mode', mode: 'follow' },
      { id: 'recite', emoji: '🎯', title: '背诵闯关', desc: '遮字背一背', action: 'challenge' },
      { id: 'review', emoji: '🔁', title: '我的复习', desc: '温故而知新', action: 'review' }
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
    dataSource: '本地数据',
    backendError: '',
    playingRecitationId: '',
    todayRecitationPages: [],
    carouselIndex: 0,
    weeklyRankPages: [],
    weeklyRankIndex: 0,
    recitationShowTab: 'hot', // 'hot' | 'rank'
    homeTab: 'learn',
    discoverFilter: 'all',
    discoverItems: [],
    failedCovers: {},
    dailyPlan: null,
    visibleDiscoverItems: [],
    discoverPage: 1,
    discoverPageSize: 10,
    discoverLoading: false,
    discoverHasMore: true,
    streak: 0,
    todayChecked: false,
    streakSub: '',
    reviewDueCount: 0,
    inviteCount: 0,
    inviteCode: '',
    communityLearners: 0,
    communitySubText: '',
    showCommunity: false,
    studyPanelOpen: false,
    ballHover: false,
    ballX: 300,
    ballY: 500,
    vx: 1.5,
    vy: -1.2,
    winW: 375,
    winH: 667,
    ballSize: 56,
    showWelcome: false,
    onboardSteps: [],
    onboardDoneCount: 0,
    onboardTotal: 0,
    onboardAllDone: true,
    onboardExpanded: false,
    inviteWelcomeVisible: false,
    inviteWelcomeText: ''
  },

  onLoad() {
    this.refreshList()
    this.loadHomeData()
    this.initBallPosition()
  },

  initBallPosition() {
    try {
      const info = wx.getSystemInfoSync()
      const W = info.windowWidth
      const H = info.windowHeight
      const ball = Math.round(112 * W / 750) // 112rpx 换算成 px
      this.setData({
        winW: W,
        winH: H,
        ballSize: ball,
        ballX: W - ball - 12,
        ballY: H - ball - 90
      })
    } catch (e) {}
  },

  startDrift() {
    if (this._driftTimer) return
    this._driftTimer = setInterval(() => {
      // 拖动中 / 面板展开 / 鼠标悬停时暂停飘动
      if (this._drag || this.data.studyPanelOpen || this.data.ballHover) return
      let { ballX, ballY, vx, vy, winW, winH, ballSize } = this.data
      let nx = ballX + vx
      let ny = ballY + vy
      const minX = 4, maxX = winW - ballSize - 4, minY = 40, maxY = winH - ballSize - 40
      if (nx <= minX) { nx = minX; vx = Math.abs(vx); vy += (Math.random() - 0.5) * 0.6 }
      else if (nx >= maxX) { nx = maxX; vx = -Math.abs(vx); vy += (Math.random() - 0.5) * 0.6 }
      if (ny <= minY) { ny = minY; vy = Math.abs(vy); vx += (Math.random() - 0.5) * 0.6 }
      else if (ny >= maxY) { ny = maxY; vy = -Math.abs(vy); vx += (Math.random() - 0.5) * 0.6 }
      // 限速，避免越弹越快
      vx = Math.max(-2.2, Math.min(2.2, vx))
      vy = Math.max(-2.2, Math.min(2.2, vy))
      this.setData({ ballX: nx, ballY: ny, vx, vy })
    }, 50)
  },

  stopDrift() {
    if (this._driftTimer) {
      clearInterval(this._driftTimer)
      this._driftTimer = null
    }
  },

  onBallHover() {
    this.setData({ ballHover: true }) // 鼠标悬停：停下并放大
  },

  onBallLeave() {
    this.setData({ ballHover: false })
  },

  onBallTouchStart(e) {
    const t = e.touches[0]
    this._drag = { x: t.clientX, y: t.clientY, bx: this.data.ballX, by: this.data.ballY, moved: false }
    this.setData({ ballHover: true }) // 按住：停下并放大（飘动循环检测 _drag 已暂停）
  },

  onBallTouchMove(e) {
    if (!this._drag) return
    const t = e.touches[0]
    const dx = t.clientX - this._drag.x
    const dy = t.clientY - this._drag.y
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this._drag.moved = true
    const { winW, winH, ballSize } = this.data
    const nx = Math.max(4, Math.min(winW - ballSize - 4, this._drag.bx + dx))
    const ny = Math.max(40, Math.min(winH - ballSize - 40, this._drag.by + dy))
    this.setData({ ballX: nx, ballY: ny })
  },

  onBallTouchEnd() {
    const moved = this._drag && this._drag.moved
    this._drag = null
    this.setData({ ballHover: false }) // 松开：恢复大小并继续飘动
    if (!moved) this.toggleStudyPanel() // 没拖动=轻点，展开面板
  },

  onShow() {
    this.loadStreak() // 每次回到首页都刷新，学习/打卡后连续天数即时更新
    this.loadReviewDue() // 复习数量随学习/复习即时更新
    this.loadOnboarding()
    this.loadInviteInfo() // 邀请数据，供悬浮球面板入口展示
    this.maybeShowInviteWelcome() // 被邀请者落地欢迎语
    this.startDrift() // 悬浮球自动飘动
    track('page_view', { name: 'index' })
    if (this._loadedOnce) return
    this._loadedOnce = true
  },

  maybeShowInviteWelcome() {
    const code = app.globalData && app.globalData.inviteWelcomeCode
    if (!code || this.data.inviteWelcomeVisible) return
    if (wx.getStorageSync('inviteWelcomeShown')) {
      app.globalData.inviteWelcomeCode = ''
      return
    }
    // 标记只展示一次，避免来回切页重复弹
    app.globalData.inviteWelcomeCode = ''
    wx.setStorageSync('inviteWelcomeShown', true)
    track('invite_landed', { from: code })
    api.getInviter(code)
      .then(res => {
        const name = res && res.nickname ? res.nickname : ''
        const text = name
          ? `你的好友「${name}」邀请你一起学古诗 🎉`
          : '你的好友邀请你一起学古诗 🎉'
        this.setData({ inviteWelcomeVisible: true, inviteWelcomeText: text })
      })
      .catch(() => {
        this.setData({ inviteWelcomeVisible: true, inviteWelcomeText: '你的好友邀请你一起学古诗 🎉' })
      })
  },

  dismissInviteWelcome() {
    this.setData({ inviteWelcomeVisible: false })
  },

  startFromInvite() {
    this.setData({ inviteWelcomeVisible: false })
    wx.switchTab({ url: '/pages/warehouse/warehouse' })
  },

  loadOnboarding() {
    const steps = onboarding.getSteps()
    const doneCount = onboarding.doneCount()
    const patch = {
      showWelcome: !onboarding.welcomeSeen(),
      onboardSteps: steps,
      onboardDoneCount: doneCount,
      onboardTotal: onboarding.total,
      onboardAllDone: onboarding.allDone()
    }
    // 只初始化一次默认展开态：全新用户(0步)默认展开引导，做过任意一步则默认收起
    if (!this._onboardInit) {
      this._onboardInit = true
      patch.onboardExpanded = doneCount === 0
    }
    this.setData(patch)
  },

  toggleOnboard() {
    this.setData({ onboardExpanded: !this.data.onboardExpanded })
  },

  toggleStudyPanel() {
    this.setData({ studyPanelOpen: !this.data.studyPanelOpen })
  },

  closeStudyPanel() {
    this.setData({ studyPanelOpen: false })
  },

  noop() {},

  dismissWelcome() {
    onboarding.setWelcomeSeen()
    this.setData({ showWelcome: false })
  },

  tapOnboardStep(e) {
    const target = e.currentTarget.dataset.target
    if (target === 'profile') {
      if (app.globalData) app.globalData.openCollectionOnShow = true
      wx.switchTab({ url: '/pages/profile/profile' })
    } else {
      wx.switchTab({ url: '/pages/warehouse/warehouse' })
    }
  },

  // 今日该复习的诗数量：学会且距上次学习≥2天
  loadReviewDue() {
    api.listProgress()
      .then(items => {
        const list = Array.isArray(items) ? items : (items.items || [])
        const due = list.filter(it =>
          it.learned && it.last_learned_at && daysSince(it.last_learned_at) >= REVIEW_INTERVAL_DAYS
        ).length
        this.setData({ reviewDueCount: due })
        this._lastProgress = list
        this.buildDailyPlan(list) // 复用同一份进度数据生成今日计划
        // 已学会过诗 → 自动勾上"学会第一首诗"
        if (!onboarding.isStepDone('learn') && list.some(it => it.learned)) {
          onboarding.markStep('learn')
          this.loadOnboarding()
        }
      })
      .catch(err => console.warn('读取复习数量失败', err))
  },

  // 生成「今日学习计划」：1 首新诗 + 最多 2 首到期复习；当天锁定，完成项打勾
  buildDailyPlan(progressList) {
    const poems = (app.getPoems && app.getPoems()) || []
    if (!poems.length) { this.setData({ dailyPlan: null }); return }

    const pm = {}
    progressList.forEach(it => {
      const pid = Number(it.poem_id != null ? it.poem_id : it.poemId)
      if (pid) pm[pid] = it
    })

    const today = localDateStr(new Date())
    const storeKey = `dailyPlan_${today}`
    let saved = wx.getStorageSync(storeKey)

    if (!saved || saved.reviewIds === undefined) {
      // 新诗：未学过(无进度或 learned=false)，排除缺音频的诗，按难度→id 取第一首
      const newCandidates = poems
        .filter(p => !(pm[p.id] && pm[p.id].learned) && !isPoemAudioPending(p))
        .sort((a, b) => (a.level || 9) - (b.level || 9) || a.id - b.id)
      const newId = newCandidates.length ? newCandidates[0].id : null
      // 复习：已学且到期，最早的优先
      const reviewIds = poems
        .filter(p => pm[p.id] && pm[p.id].learned && daysSince(pm[p.id].last_learned_at) >= REVIEW_INTERVAL_DAYS)
        .sort((a, b) => parseServerTime(pm[a.id].last_learned_at) - parseServerTime(pm[b.id].last_learned_at))
        .slice(0, PLAN_REVIEW_CAP)
        .map(p => p.id)
      saved = { newId, reviewIds }
      wx.setStorageSync(storeKey, saved)
    }

    const poemMap = {}
    poems.forEach(p => { poemMap[p.id] = p })
    const items = []
    if (saved.newId && poemMap[saved.newId]) {
      const p = poemMap[saved.newId]
      const done = !!(pm[p.id] && pm[p.id].learned && isToday(pm[p.id].last_learned_at))
      items.push({ kind: 'new', id: p.id, title: p.title, sub: `${p.dynasty || ''} · ${p.author || ''}`, done })
    }
    ;(saved.reviewIds || []).forEach(rid => {
      if (!poemMap[rid]) return
      const p = poemMap[rid]
      const done = !!(pm[rid] && isToday(pm[rid].last_learned_at))
      items.push({ kind: 'review', id: rid, title: p.title, sub: '复习巩固', done })
    })

    if (!items.length) {
      this.setData({ dailyPlan: { empty: true } })
      return
    }
    const doneCount = items.filter(it => it.done).length
    const allDone = doneCount === items.length
    this.setData({ dailyPlan: { items, doneCount, total: items.length, allDone, empty: false } })

    if (!this._planViewTracked) { this._planViewTracked = true; track('daily_plan_view', { total: items.length }) }
    if (allDone && !this._planDoneTracked) { this._planDoneTracked = true; track('daily_plan_complete', { total: items.length }) }
  },

  goPlanItem(e) {
    const { id, kind } = e.currentTarget.dataset
    if (!id) return
    track('daily_plan_tap', { kind })
    if (kind === 'review') {
      wx.navigateTo({ url: '/pages/review/review' })
    } else {
      wx.navigateTo({ url: `/pages/learn/learn?id=${id}&type=poem` })
    }
  },

  goReview() {
    wx.navigateTo({ url: '/pages/review/review' })
  },

  loadStreak() {
    api.getStats()
      .then(stats => {
        const streak = stats.streak || 0
        const todayChecked = !!stats.today_checked
        let streakSub = ''
        if (todayChecked) {
          streakSub = '今天已经学习啦，真棒！'
        } else if (streak > 0) {
          streakSub = '别让连续中断啦，今天再学一首'
        } else {
          streakSub = '今天开启第一天，点亮一首诗吧'
        }
        this.setData({ streak, todayChecked, streakSub })
      })
      .catch(err => console.warn('读取连续学习天数失败', err))
  },

  goChallenge() {
    wx.switchTab({ url: '/pages/challenge/challenge' })
  },

  loadInviteInfo() {
    api.getInviteInfo()
      .then(info => {
        this.setData({
          inviteCount: (info && info.invite_count) || 0,
          inviteCode: (info && info.invite_code) || ''
        })
      })
      .catch(() => {})
  },

  onShareAppMessage() {
    const code = this.data.inviteCode
    track('share_clicked', { type: 'home', from: 'index' })
    return {
      title: '萌学古诗：每天读一点，慢慢爱上古诗',
      path: code ? `/pages/index/index?invite=${code}` : '/pages/index/index'
    }
  },

  onShareTimeline() {
    const code = this.data.inviteCode
    return {
      title: '萌学古诗：每天读一点，慢慢爱上古诗',
      query: code ? `invite=${code}` : ''
    }
  },


  refreshList() {
    const poems = (app.getPoems && app.getPoems()) || []
    this.setData({
      totalPoems: poems.length,
      dataSource: app.globalData.poemsLoadedFromBackend ? '后端数据库' : '服务维护中',
      backendError: app.globalData.backendError || ''
    })
    // 进度先到、诗词后到的时序兜底：诗词就绪后补建今日计划
    if (poems.length && this._lastProgress && !this.data.dailyPlan) {
      this.buildDailyPlan(this._lastProgress)
    }
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

  applyHomePoems(poems, progressItems) {
    const todayPoem = this.pickTodayPoem(poems, progressItems)
    this.setData({
      totalPoems: poems.length,
      todayPoem,
      dataSource: '后端数据库',
      backendError: ''
    })
  },

  loadCommunityStats() {
    api.getCommunityStats()
      .then(res => {
        const learners = res.learners || 0
        const todayLit = res.today_lit || 0
        const totalLit = res.total_lit || 0
        // 今天有学习就显示今日，否则显示累计（始终>0，不显冷清）
        const sub = todayLit > 0
          ? `今天点亮了 ${todayLit} 首诗`
          : `累计点亮了 ${totalLit} 首古诗`
        this.setData({
          communityLearners: learners,
          communitySubText: sub,
          showCommunity: learners > 0
        })
      })
      .catch(err => console.warn('读取社区数据失败', err))
  },

  loadHomeData() {
    // 域名 HTTPS 入口偶发 reset 时，首屏并发越高越容易丢请求；分批加载更稳。
    this.forceRefreshBackend()
    setTimeout(() => this.loadCommunityStats(), 80)
    setTimeout(() => this.loadThemes(), 120)
    setTimeout(() => this.loadRecommendations(), 260)
    setTimeout(() => this.loadPopularRecitations(), 420)
    setTimeout(() => this.loadDiscoverItems(), 650)
  },

  forceRefreshBackend() {
    if (!api.config.useBackendPoems) return
    api.login()
      .then(() => api.getTodayPoem())
      .then(todayPoem => {
        app.globalData.poemsLoadedFromBackend = true
        app.globalData.backendError = ''
        this.setData({
          todayPoem,
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
    // 人气朗诵：后端已做"最新100条 → 点赞前30 → 随机10条"
    api.getHotRecitationPick()
      .then(res => {
        const items = res.items || []
        const carouselPages = []
        for (let i = 0; i < items.length; i += 2) {
          carouselPages.push(items.slice(i, i + 2))
        }

        // 本周排行：请求全部热度数据，按点赞数取前 10
        api.getPopularRecitations({ limit: 50 })
          .then(res2 => {
            const all = res2.items || []
            all.sort((a, b) => b.recitation.like_count - a.recitation.like_count)
            const top10 = all.slice(0, 10).map((item, i) => ({ ...item, _rankIndex: i + 1 }))
            const rankPages = []
            for (let i = 0; i < top10.length; i += 2) {
              rankPages.push(top10.slice(i, i + 2))
            }
            this.setData({ weeklyRankPages: rankPages, weeklyRankIndex: 0 })
          })
          .catch(() => {})

        this.setData({
          popularRecitations: [],
          todayRecitationPages: carouselPages,
          carouselIndex: 0
        })
      })
      .catch(err => console.warn('读取人气朗诵失败', err))
  },

  // 停止本页所有朗诵音频并复位状态（发现页/轮播共用）
  stopPageRecitation() {
    this._playToken = null // 中止仍在下载中的播放
    if (this.audio) {
      try { this.audio.destroy() } catch (e) {}
      this.audio = null
    }
    if (this.carouselAudio) {
      try { this.carouselAudio.destroy() } catch (e) {}
      this.carouselAudio = null
    }
    audioManager.stopAll()
    if (this.data.playingRecitationId) this.setData({ playingRecitationId: '' })
  },

  switchHomeTab(e) {
    const tab = e.currentTarget.dataset.tab || 'learn'
    if (tab !== this.data.homeTab) this.stopPageRecitation() // 切换发现/诗旅时停掉正在播放的朗诵
    this.setData({ homeTab: tab })
    if (tab === 'discover') this.loadDiscoverItems({ reset: true })
  },

  switchRecitationShowTab(e) {
    const tab = e.currentTarget.dataset.tab || 'hot'
    if (tab === this.data.recitationShowTab) return
    // 切换标签时停止当前播放
    this._playToken = null
    if (this.carouselAudio) {
      try { this.carouselAudio.destroy() } catch (e) {}
      this.carouselAudio = null
    }
    this.setData({
      recitationShowTab: tab,
      playingRecitationId: ''
    })
  },

  onCarouselChange(e) {
    this.setData({ carouselIndex: e.detail.current })
  },

  onWeeklyRankChange(e) {
    this.setData({ weeklyRankIndex: e.detail.current })
  },

  async playCarouselRecitation(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return

    // 如果点的是正在播放的，停止
    if (this.data.playingRecitationId === id) {
      audioManager.destroy('index-carousel-recitation')
      this.carouselAudio = null
      this.setData({ playingRecitationId: '' })
      return
    }

    // 停止之前所有音频（包括轮播和排行）
    audioManager.destroyAll()
    this.carouselAudio = null
    this.setData({ playingRecitationId: '' })

    const token = `carousel:${id}:${Date.now()}`
    this._playToken = token
    const url = `${api.config.apiBaseUrl}/recitations/${id}/audio`
    let audioPath = url
    try {
      audioPath = await audioCache.downloadAndCache(url, { tag: 'recitation-audio' })
    } catch (err) {
      console.warn('轮播朗诵缓存失败，尝试直接播放', err)
    }

    if (this._playToken !== token) return // 已离开/切走，放弃本次播放
    this.carouselAudio = audioManager.create('index-carousel-recitation')
    this.carouselAudio.onEnded(() => {
      this.setData({ playingRecitationId: '' })
      this.carouselAudio = null
    })
    this.carouselAudio.onStop(() => {
      this.setData({ playingRecitationId: '' })
      this.carouselAudio = null
    })
    this.carouselAudio.onError(err => {
      console.warn('轮播朗诵播放失败', err)
      this.setData({ playingRecitationId: '' })
      this.carouselAudio = null
      wx.showToast({ title: '播放失败', icon: 'none' })
    })
    this.carouselAudio.src = audioPath
    this.setData({ playingRecitationId: id })
    setTimeout(() => {
      if (this.carouselAudio && this.data.playingRecitationId === id) {
        audioManager.playWithRetry(this.carouselAudio, {
          attempts: 3,
          delay: 220
        })
      }
    }, 100)
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
        const recitations = recitationRaw.map(item => {
          const rec = item.recitation || {}
          const poemId = rec.poem_id
          return {
            id: rec.id,
            type: 'recitation',
            title: `朗诵《${item.poem_title || '古诗'}》`,
            poemTitle: item.poem_title || '',
            poemId,
            poemImageUrl: getPoemImageUrl(poemId),
            // 配图缺失时按 poem_id 取一档渐变色，避免整墙同色
            coverTone: (Number(poemId) || 0) % 6,
            durationText: formatDuration(rec.duration_seconds),
            nickname: rec.nickname || '小诗童',
            avatarUrl: rec.avatar_url || '',
            likeCount: rec.like_count || 0,
            likedByMe: !!rec.liked_by_me,
            createdAt: rec.created_at || ''
          }
        }).filter(item => item.id)
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
    const id = e.currentTarget.dataset.id
    if (id && this.data.playingRecitationId !== id) {
      track('recitation_play', { recitation_id: id })
    }
    this.playPopularRecitation(e)
  },

  onRecitationCoverError(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const failedCovers = Object.assign({}, this.data.failedCovers)
    failedCovers[id] = true
    this.setData({ failedCovers })
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


  // 「今天怎么学」入口分发：分类/模式跳诗园，背诵闯关跳诗光，复习跳复习页
  tapLearnEntry(e) {
    const action = e.currentTarget.dataset.action
    if (action === 'challenge') return this.goChallenge()
    if (action === 'review') return this.goReview()
    this.openLearningPath(e)
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
    // 播放令牌：下载是异步的，若期间离开页面/切tab则中止，避免“缓存完才在别的页响起”
    const token = `${id}:${Date.now()}`
    this._playToken = token
    let audioPath = url
    wx.showLoading({ title: '加载音频...' })
    try {
      audioPath = await audioCache.downloadAndCache(url, { tag: 'recitation-audio' })
    } catch (err) {
      console.warn('人气朗诵缓存失败，尝试直接播放远程 URL', err, url)
      audioPath = url
    }
    wx.hideLoading()
    if (this._playToken !== token) return // 已离开/切走，放弃本次播放
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
    this.stopPageRecitation() // 离开首页(切tab/进其他页)立即停掉朗诵并复位
    this.stopDrift()
  },

  onUnload() {
    this.stopPageRecitation()
    audioManager.destroyAll()
    this.stopDrift()
  }
})
