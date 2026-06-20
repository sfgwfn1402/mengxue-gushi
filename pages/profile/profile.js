// pages/profile/profile.js
const app = getApp()
const api = require('../../utils/api')
const versionInfo = require('../../config/version')

Page({
  data: {
    learnedCount: 0,
    learnedIdiomCount: 0,
    totalDays: 1,
    level: 1,
    streak: 0,
    todayChecked: false,
    calendar: [],
    encourageMessage: '今天的古诗背了吗？加油！💪',
    userProfile: null,
    nicknameInput: '',
    avatarUrl: '',
    profileSaving: false,
    modalVisible: false,
    modalTitle: '',
    modalType: '',
    modalItems: [],
    modalText: '',
    aboutLines: [],
    appVersion: versionInfo.version || '',
    isAdmin: false
  },

  onShow() {
    this.loadProfile()
    this.loadData()
    this.initCalendar()
    this.checkTodayStatus()
    this.updateEncourageMessage()
  },

  loadProfile() {
    api.login()
      .then(() => api.getMe())
      .then(user => {
        wx.setStorageSync('apiUser', user)
        const nickname = user.nickname || ''
        const avatarUrl = user.avatar_url || ''
        this.setData({
          userProfile: user,
          nicknameInput: nickname,
          avatarUrl,
          isAdmin: user.role === 'admin'
        })
      })
      .catch(err => {
        console.warn('登录或读取用户资料失败', err)
        wx.showToast({ title: '登录失败，请稍后重试', icon: 'none' })
      })
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail && e.detail.avatarUrl
    if (!avatarUrl) return

    this.persistAvatar(avatarUrl)
      .then(savedPath => this.setData({ avatarUrl: savedPath }))
      .catch(err => {
        console.warn('保存头像到本地持久目录失败，使用临时头像路径', err)
        this.setData({ avatarUrl })
      })
  },

  persistAvatar(tempPath) {
    if (!tempPath || !tempPath.startsWith('wxfile://')) return Promise.resolve(tempPath)
    if (!wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) return Promise.resolve(tempPath)

    const fs = wx.getFileSystemManager()
    const extMatch = tempPath.match(/\.(jpg|jpeg|png|webp)$/i)
    const ext = extMatch ? extMatch[0] : '.jpg'
    const savedPath = `${wx.env.USER_DATA_PATH}/profile-avatar${ext}`

    return new Promise((resolve, reject) => {
      fs.copyFile({
        srcPath: tempPath,
        destPath: savedPath,
        success: () => resolve(savedPath),
        fail: reject
      })
    })
  },

  shouldUploadAvatar(avatarUrl) {
    return !!avatarUrl && !/^https?:\/\//i.test(avatarUrl)
  },

  onNicknameInput(e) {
    this.setData({ nicknameInput: e.detail.value || '' })
  },

  saveProfile() {
    const nickname = (this.data.nicknameInput || '').trim()
    const avatarUrl = this.data.avatarUrl || ''
    if (!nickname) {
      wx.showToast({ title: '请先填写昵称', icon: 'none' })
      return
    }

    this.setData({ profileSaving: true })
    const avatarUpload = this.shouldUploadAvatar(avatarUrl)
      ? api.uploadAvatar(avatarUrl).then(res => res.avatar_url || avatarUrl)
      : Promise.resolve(avatarUrl)

    avatarUpload
      .then(uploadedAvatarUrl => api.updateProfile({ nickname, avatar_url: uploadedAvatarUrl }))
      .then(user => {
        this.setData({
          userProfile: user,
          nicknameInput: user.nickname || nickname,
          avatarUrl: user.avatar_url || avatarUrl,
          profileSaving: false
        })
        wx.setStorageSync('apiUser', user)
        wx.showToast({ title: '资料已保存', icon: 'success' })
      })
      .catch(err => {
        console.warn('保存用户资料失败', err)
        this.setData({ profileSaving: false })
        wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
      })
  },

  loadData() {
    api.getStats()
      .then(stats => {
        const learnedPoemCount = stats.learned_poem_count || 0
        this.setData({
          learnedCount: learnedPoemCount,
          learnedIdiomCount: 0,
          totalDays: stats.total_days || 0,
          level: Math.floor(learnedPoemCount / 3) + 1,
          streak: stats.streak || 0,
          todayChecked: !!stats.today_checked
        })
      })
      .catch(err => {
        console.warn('读取后端学习统计失败', err)
        wx.showToast({ title: '服务维护中', icon: 'none' })
      })
  },

  initCalendar() {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const today = now.getDate()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const checkins = []
    const calendar = []

    for (let i = 0; i < firstDay; i++) calendar.push({ day: '', checked: false, today: false })
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      calendar.push({ day, checked: checkins.includes(dateStr), today: day === today })
    }
    this.setData({ calendar })
  },

  checkTodayStatus() {
    api.getStats()
      .then(stats => this.setData({ todayChecked: !!stats.today_checked }))
      .catch(err => console.warn('读取打卡状态失败', err))
  },

  updateEncourageMessage() {
    const messages = [
      '📚 书山有路勤为径，学海无涯苦作舟',
      '🌟 每天进步一点点，成为更好的自己',
      '💪 坚持就是胜利，明天也要来哦',
      '📖 腹有诗书气自华，多学多用顶呱呱',
      '🏆 今日一小步，明天一大步',
      '🎓 好好学习，天天向上',
      '⭐ 知识的种子，终将长成参天大树',
      '💫 每一首古诗，都是一个美丽的世界'
    ]
    this.setData({ encourageMessage: messages[Math.floor(Math.random() * messages.length)] })
  },

  doCheckin() {
    if (this.data.todayChecked) {
      wx.showToast({ title: '今天已打卡啦～', icon: 'none' })
      return
    }

    api.checkin()
      .then(res => {
        this.setData({
          todayChecked: !!res.today_checked,
          totalDays: res.total_days || 0,
          streak: res.streak || 0
        })
        this.initCalendar()
        return api.completeTask('share', 2)
      })
      .then(res => {
        const added = res && typeof res.stars_added === 'number' ? res.stars_added : 0
        wx.showToast({ title: added > 0 ? `打卡成功 +${added}⭐` : '打卡成功！🎉', icon: 'none', duration: 1800 })
      })
      .catch(err => {
        console.warn('打卡失败', err)
        wx.showToast({ title: '服务维护中', icon: 'none' })
      })
  },

  updateStreak() {
    this.loadData()
  },

  getPoemMap() {
    const poems = (app.getPoems && app.getPoems()) || []
    const map = {}
    poems.forEach(p => { map[p.id] = p })
    return map
  },

  handleMenuTap(e) {
    const action = e.currentTarget.dataset.action
    if (action === 'works') wx.navigateTo({ url: '/pages/works/works' })
    if (action === 'favorites') this.openFavorites()
    if (action === 'records') this.openRecords()
    if (action === 'achievements') this.openAchievements()
    if (action === 'feedback') this.openFeedback()
    if (action === 'admin') wx.navigateTo({ url: '/pages/admin/admin' })
    if (action === 'settings') this.openSettings()
  },

  handleStatTap(e) {
    const type = e.currentTarget.dataset.type
    if (type === 'poems') this.openLearnedPoems()
    if (type === 'days') this.openRecords()
  },

  openLearnedPoems() {
    Promise.all([api.listProgress(), api.listPoems({ page: 1, page_size: 500 })])
      .then(([progressRes, poemRes]) => {
        const progressItems = Array.isArray(progressRes) ? progressRes : (progressRes.items || [])
        const poemMap = {}
        ;(poemRes.items || []).forEach(p => { poemMap[p.id] = p })
        const learned = progressItems
          .filter(item => !!item.learned)
          .sort((a, b) => String(b.last_learned_at || '').localeCompare(String(a.last_learned_at || '')))
          .map(item => {
            const poem = poemMap[item.poem_id] || poemMap[item.poemId]
            if (!poem) return null
            return {
              id: poem.id,
              type: 'poem',
              title: `《${poem.title}》`,
              desc: `${poem.dynasty || ''} · ${poem.author || ''}${item.last_learned_at ? `｜${item.last_learned_at}` : ''}`
            }
          })
          .filter(Boolean)
        this.setData({
          modalVisible: true,
          modalTitle: `📚 已学古诗（${learned.length}）`,
          modalType: 'list',
          modalItems: learned,
          modalText: learned.length ? '' : '还没有学会的古诗。去诗园挑一首，点击“学会”后这里就会出现。'
        })
      })
      .catch(err => {
        console.warn('读取已学古诗失败', err)
        wx.showToast({ title: '读取失败，请稍后重试', icon: 'none' })
      })
  },

  openFavorites() {
    const showItems = (poems) => {
      const items = poems.filter(Boolean).map(p => ({
        id: p.id,
        title: p.title,
        desc: `${p.dynasty} · ${p.author}`,
        type: 'poem'
      }))
      this.setData({
        modalVisible: true,
        modalTitle: '📚 我的收藏',
        modalType: 'list',
        modalItems: items,
        modalText: items.length ? '' : '还没有收藏古诗。去仓库学一首，点 ❤️ 收藏吧。'
      })
    }

    api.listFavorites()
      .then(res => showItems(res.items || []))
      .catch(err => {
        console.warn('读取后端收藏失败', err)
        showItems([])
        wx.showToast({ title: '服务维护中', icon: 'none' })
      })
  },

  openRecords() {
    api.getStats()
      .then(stats => {
        const text = [
          `已学古诗：${stats.learned_poem_count || 0} 首`,
          `累计学习天数：${stats.total_days || 0} 天`,
          `连续打卡：${stats.streak || 0} 天`,
          `今日任务：${(stats.today_tasks_done || []).length} 项已完成`
        ].join('\n')
        this.setData({ modalVisible: true, modalTitle: '📖 学习记录', modalType: 'text', modalItems: [], modalText: text })
      })
      .catch(err => {
        console.warn('读取学习记录失败', err)
        wx.showToast({ title: '服务维护中', icon: 'none' })
      })
  },

  openAchievements() {
    const total = this.data.learnedCount
    const achievements = [
      { title: '初次见面', desc: total >= 1 ? '已获得：完成第一次学习' : '未获得：学习任意一首诗' },
      { title: '小诗童', desc: this.data.learnedCount >= 5 ? '已获得：收藏 5 首古诗' : `进度：${this.data.learnedCount}/5 首` },
      { title: '坚持打卡', desc: this.data.streak >= 3 ? '已获得：连续打卡 3 天' : `进度：${this.data.streak}/3 天` },
      { title: '诗词小达人', desc: this.data.learnedCount >= 20 ? '已获得：收藏 20 首古诗' : `进度：${this.data.learnedCount}/20 首` }
    ]
    this.setData({ modalVisible: true, modalTitle: '🏆 成就墙', modalType: 'list', modalItems: achievements, modalText: '' })
  },

  openFeedback() {
    wx.navigateTo({
      url: '/pages/feedback/feedback',
      fail: (err) => {
        console.warn('打开反馈页失败', err)
        this.setData({
          modalVisible: true,
          modalTitle: '💬 家长心声与建议',
          modalType: 'text',
          modalItems: [],
          modalText: '反馈页面暂时打不开，可以稍后再试。'
        })
      }
    })
  },

  openSettings() {
    wx.showActionSheet({
      itemList: ['清空学习数据', '关于萌学古诗'],
      success: (res) => {
        if (res.tapIndex === 0) this.confirmClearData()
        if (res.tapIndex === 1) this.openAbout()
      }
    })
  },

  openAbout() {
    const notes = Array.isArray(versionInfo.notes) ? versionInfo.notes : []
    this.setData({
      modalVisible: true,
      modalTitle: '萌学古诗',
      modalType: 'about',
      modalText: '',
      modalItems: [],
      aboutLines: [
        { label: '版本', value: versionInfo.version || '-' },
        { label: '更新', value: notes.length ? notes.join('、') : '暂无更新说明' }
      ]
    })
  },

  confirmClearData() {
    wx.showModal({
      title: '确认清空？',
      content: '会清空收藏、打卡、任务和学习天数，不能恢复。',
      confirmText: '清空',
      confirmColor: '#FF6B6B',
      success: (res) => {
        if (!res.confirm) return
        api.clearUserData()
          .then(() => {
            this.loadData()
            this.initCalendar()
            this.checkTodayStatus()
            wx.showToast({ title: '已清空', icon: 'none' })
          })
          .catch(err => {
            console.warn('清空数据失败', err)
            wx.showToast({ title: '服务维护中', icon: 'none' })
          })
      }
    })
  },

  getTodayKey() {
    const now = new Date()
    return `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${now.getDate()}`
  },

  noop() {},

  closeModal() {
    this.setData({
      modalVisible: false,
      modalType: '',
      aboutLines: []
    })
  },

  openModalItem(e) {
    const item = this.data.modalItems[e.currentTarget.dataset.index]
    if (item && item.type === 'poem') {
      this.closeModal()
      wx.navigateTo({ url: `/pages/learn/learn?id=${item.id}&type=poem` })
    }
  }
})
