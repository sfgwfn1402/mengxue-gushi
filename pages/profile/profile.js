// pages/profile/profile.js
const app = getApp()
const api = require('../../utils/api')
const versionInfo = require('../../config/version')
const onboarding = require('../../utils/onboarding')
const { track } = require('../../utils/track')

Page({
  data: {
    learnedCount: 0,
    learnedIdiomCount: 0,
    totalDays: 1,
    level: 1,
    streak: 0,
    todayChecked: false,
    recentDays: [],
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
    collectionGroups: [],
    collectionLearned: 0,
    collectionTotal: 0,
    collectionEmptyHint: '',
    collectionBadges: [],
    collectionLearnedTitles: [],
    collectionCardGenerating: false,
    aboutLines: [],
    appVersion: versionInfo.version || '',
    isAdmin: false,
    recentResult: null,
    recentResultText: '',
    recentResultDate: '',
    inviteCount: 0,
    inviteCode: '',
    inviteBadge: '',
    inviteBadgeLabel: '',
    inviteNextAt: 0,
    shareCardPath: ''
  },

  onShow() {
    this.loadProfile()
    this.loadData()
    this.loadRecentResult()
    this.initCalendar()
    this.checkTodayStatus()
    this.updateEncourageMessage()
    this.loadInviteInfo()
    track('page_view', { name: 'profile' })
    // 从学习页庆祝弹窗”看我的诗集”跳来时，自动弹开诗集墙
    if (app.globalData && app.globalData.openCollectionOnShow) {
      app.globalData.openCollectionOnShow = false
      this.openLearnedPoems()
    }
  },

  loadInviteInfo() {
    api.getInviteInfo()
      .then(info => {
        this.setData({
          inviteCode: info.invite_code || '',
          inviteCount: info.invite_count || 0,
          inviteBadge: info.badge || '',
          inviteBadgeLabel: info.badge_label || '',
          inviteNextAt: info.next_badge_at || 0
        })
      })
      .catch(() => {})
  },

  // 邀请/成就卡分享统一走 onShareAppMessage（按钮 open-type="share" 触发）。
  // 这里仅在没有邀请码时给个提示，不阻断系统分享。
  shareInvite() {
    if (!this.data.inviteCode) {
      wx.showToast({ title: '正在准备邀请码…', icon: 'none' })
    }
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

  loadRecentResult() {
    const history = wx.getStorageSync('learningResultHistory') || []
    const result = (Array.isArray(history) && history[0]) || wx.getStorageSync('lastLearningResult')
    if (!result || !result.poemId) {
      this.setData({ recentResult: null, recentResultText: '', recentResultDate: '' })
      return
    }
    const actionMap = {
      follow: '完成了跟读',
      learned: '点亮了古诗',
      recitation: '生成了朗诵作品',
      artwork: '发布了诗配画',
      preview: '正在学习'
    }
    this.setData({
      recentResult: result,
      recentResultText: `${actionMap[result.kind] || '学习了'}《${result.poemTitle || '古诗'}》`,
      recentResultDate: this.formatRecentDate(result.completedAt),
      recentActionText: result.kind === 'artwork' ? '再画一张' : '录朗诵'
    })
  },

  formatRecentDate(value) {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const now = new Date()
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    if (sameDay) return `今天 ${hm}`
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${hm}`
  },

  openRecentPoem() {
    const result = this.data.recentResult
    if (!result || !result.poemId) return
    wx.navigateTo({ url: `/pages/learn/learn?type=poem&id=${result.poemId}` })
  },

  createRecentRecitation() {
    const result = this.data.recentResult
    if (!result || !result.poemId) return
    wx.setStorageSync('createSelectedPoem', {
      id: result.poemId,
      title: result.poemTitle,
      author: result.poemAuthor,
      dynasty: result.poemDynasty,
      mode: result.kind === 'artwork' ? 'artwork' : 'recitation',
      updatedAt: Date.now()
    })
    wx.switchTab({ url: '/pages/create/create' })
  },

  openMyWorks() {
    wx.navigateTo({ url: '/pages/works/works?tab=recitations' })
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
        this.initCalendar()
      })
      .catch(err => {
        console.warn('读取后端学习统计失败', err)
        wx.showToast({ title: '服务维护中', icon: 'none' })
      })
  },

  // 学习打卡条：展示最近 7 天的坚持情况（非日历服务，避免整月日历类目问题）
  initCalendar() {
    const now = new Date()
    const streak = this.data.streak || 0
    const todayChecked = !!this.data.todayChecked
    const weekChar = ['日', '一', '二', '三', '四', '五', '六']
    const recentDays = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const isToday = i === 0
      // 最近连续 streak 天视为已坚持；今天以打卡状态为准
      const checked = isToday ? todayChecked : i < streak
      recentDays.push({
        label: isToday ? '今天' : `周${weekChar[d.getDay()]}`,
        checked,
        today: isToday
      })
    }
    this.setData({ recentDays })
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
        track('checkin', { streak: res.streak || 0 })
        return api.completeTask('share', 2)
      })
      .then(res => {
        const added = res && typeof res.stars_added === 'number' ? res.stars_added : 0
        wx.showToast({ title: added > 0 ? `打卡成功 +${added}⭐` : '打卡成功！🎉', icon: 'none', duration: 1800 })
        // 打卡后顺势引导开启学习提醒（一次性订阅，需用户点击触发）
        setTimeout(() => this.openStudyReminder(), 1500)
      })
      .catch(err => {
        console.warn('打卡失败', err)
        wx.showToast({ title: '服务维护中', icon: 'none' })
      })
  },

  // 申请"学习提醒"订阅（一次性订阅：每授权一次后端 +1 额度）
  openStudyReminder() {
    if (!wx.requestSubscribeMessage) {
      wx.showToast({ title: '当前微信版本不支持提醒', icon: 'none' })
      return
    }
    const tmplId = 'fzZRTV2ni_DCk03oCTkFz5bRsJ5bzEbaOdl09q3zp3g'
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (res) => {
        if (res[tmplId] === 'accept') {
          track('reminder_subscribed')
          api.subscribeReminder()
            .then(() => wx.showToast({ title: '已开启学习提醒 🔔', icon: 'none' }))
            .catch(err => console.warn('记录订阅失败', err))
        }
      },
      fail: (err) => console.warn('请求订阅失败', err)
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
    if (action === 'cards') wx.navigateTo({ url: '/pages/cards/cards' })
    if (action === 'works') wx.navigateTo({ url: '/pages/works/works' })
    if (action === 'favorites') this.openFavorites()
    if (action === 'records') this.openRecords()
    if (action === 'achievements') this.openAchievements()
    if (action === 'feedback') this.openFeedback()
    if (action === 'admin') wx.navigateTo({ url: '/pages/admin/admin' })
    if (action === 'parent-report') wx.navigateTo({ url: '/pages/parent-report/parent-report' })
    if (action === 'voice-agreement') wx.navigateTo({ url: '/pages/voice-agreement/voice-agreement' })
    if (action === 'settings') this.openSettings()
  },

  handleStatTap(e) {
    const type = e.currentTarget.dataset.type
    if (type === 'poems') this.openLearnedPoems()
    if (type === 'days') this.openRecords()
  },

  openLearnedPoems() {
    onboarding.markStep('collection') // 新手引导：看过诗集墙
    Promise.all([api.listProgress(), api.listAllPoems()])
      .then(([progressRes, poemRes]) => {
        const progressItems = Array.isArray(progressRes) ? progressRes : (progressRes.items || [])
        const progressMap = {}
        progressItems.forEach(item => {
          const pid = Number(item.poem_id != null ? item.poem_id : item.poemId)
          if (pid) progressMap[pid] = item
        })

        // 启蒙=1 / 进阶=2 / 挑战=3，与诗园分级一致
        const groups = [
          { key: 1, label: '启蒙', learned: 0, total: 0, cells: [] },
          { key: 2, label: '进阶', learned: 0, total: 0, cells: [] },
          { key: 3, label: '挑战', learned: 0, total: 0, cells: [] }
        ]
        const groupByKey = { 1: groups[0], 2: groups[1], 3: groups[2] }

        let learnedCount = 0
        const learnedTitles = []
        const allPoems = (poemRes.items || []).slice().sort((a, b) => Number(a.id) - Number(b.id))
        allPoems.forEach(poem => {
          const diff = Number(poem.difficulty) || 1
          const group = groupByKey[diff] || groups[0]
          const cell = this.buildCollectionCell(poem, progressMap[Number(poem.id)])
          group.total += 1
          if (cell.state === 'learned') {
            group.learned += 1
            learnedCount += 1
            learnedTitles.push(poem.title)
          }
          group.cells.push(cell)
        })

        const collectionBadges = [10, 20, 50, 100].map(value => ({
          value,
          earned: learnedCount >= value
        }))

        this.setData({
          modalVisible: true,
          modalTitle: '📚 我的诗集',
          modalType: 'collection',
          modalItems: [],
          modalText: '',
          collectionGroups: groups.filter(g => g.total > 0),
          collectionLearned: learnedCount,
          collectionTotal: allPoems.length,
          collectionEmptyHint: learnedCount ? '' : '挑一首点亮第一颗星 ⭐',
          collectionBadges,
          collectionLearnedTitles: learnedTitles
        })
      })
      .catch(err => {
        console.warn('读取我的诗集失败', err)
        wx.showToast({ title: '读取失败，请稍后重试', icon: 'none' })
      })
  },

  // 计算单首诗在诗集墙上的状态与星级（复用后端已有进度字段，不新增接口）
  buildCollectionCell(poem, progress) {
    let state = 'untouched'
    let star = 0
    if (progress) {
      const readCount = Number(progress.read_count) || 0
      const quizCorrect = Number(progress.quiz_correct_count) || 0
      if (progress.learned) {
        state = 'learned'
        star = 1                                  // 学会
        if (readCount >= 3) star = 2              // 学会 + 读过≥3遍
        if (readCount >= 3 && quizCorrect >= 1) star = 3 // 会读又答对过题
      } else if (readCount >= 1) {
        state = 'learning'                        // 读过但还没点“学会”
      }
    }
    return {
      id: poem.id,
      title: poem.title,
      state,
      star,
      stars: star > 0 ? '⭐'.repeat(star) : (state === 'learning' ? '✨' : '')
    }
  },

  openCollectionCell(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.closeModal()
    wx.navigateTo({ url: `/pages/learn/learn?id=${id}&type=poem` })
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

  // 从诗集墙生成「成长档案」成就卡，给家长晒孩子的整体进度
  shareCollectionCard() {
    if (this.data.collectionCardGenerating) return
    if (!this.data.collectionLearned) {
      wx.showToast({ title: '先点亮一首诗再来晒成果吧', icon: 'none' })
      return
    }
    this.setData({ collectionCardGenerating: true })
    wx.showLoading({ title: '生成卡片…' })
    this.drawCollectionCard()
      .then(filePath => {
        wx.hideLoading()
        // 存下卡片图作为"分享给好友"的缩略图，并显示分享按钮
        this.setData({ collectionCardGenerating: false, shareCardPath: filePath })
        wx.showActionSheet({
          itemList: ['预览卡片', '保存到相册'],
          success: res => {
            if (res.tapIndex === 0) wx.previewImage({ urls: [filePath], current: filePath })
            if (res.tapIndex === 1) this.saveCollectionCard(filePath)
          }
        })
      })
      .catch(err => {
        wx.hideLoading()
        console.warn('生成成就卡失败', err)
        this.setData({ collectionCardGenerating: false })
        wx.showToast({ title: '生成失败', icon: 'none' })
      })
  },

  drawCollectionCard() {
    const apiUser = wx.getStorageSync('apiUser') || {}
    const nickname = apiUser.nickname || (this.data.userProfile && this.data.userProfile.nickname) || '小诗童'
    const learned = this.data.collectionLearned || 0
    const total = this.data.collectionTotal || 0
    const badges = (this.data.collectionBadges || []).filter(b => b.earned)
    const titles = (this.data.collectionLearnedTitles || []).slice(-6) // 最近点亮的几首
    const dateText = this.formatCardDate(Date.now())
    return new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext('collectionCard', this)
      const W = 600, H = 900
      ctx.setFillStyle('#FFF7E8'); ctx.fillRect(0, 0, W, H)
      // 顶部渐变头
      const grd = ctx.createLinearGradient(0, 0, W, 300)
      grd.addColorStop(0, '#FFD36B'); grd.addColorStop(1, '#FF8A65')
      ctx.setFillStyle(grd); ctx.fillRect(0, 0, W, 300)
      ctx.setTextAlign('center')
      ctx.setFillStyle('#5B3300')
      ctx.setFontSize(30); ctx.fillText('萌学古诗 · 成长档案', W / 2, 86)
      ctx.setFontSize(40); ctx.fillText(`${nickname} 的古诗成就`, W / 2, 150)
      // 大数字
      ctx.setFillStyle('#FFFFFF')
      ctx.setFontSize(120); ctx.fillText(`${learned}`, W / 2 - 40, 252)
      ctx.setFontSize(40); ctx.fillText(`/ ${total} 首`, W / 2 + 90, 252)

      // 进度条
      const barX = 64, barY = 332, barW = 472, barH = 28
      ctx.setFillStyle('#FFE6C2'); this.cardRoundRect(ctx, barX, barY, barW, barH, 14); ctx.fill()
      const ratio = total ? Math.max(0.02, Math.min(1, learned / total)) : 0
      ctx.setFillStyle('#FF7A45'); this.cardRoundRect(ctx, barX, barY, barW * ratio, barH, 14); ctx.fill()
      ctx.setFillStyle('#9A5B00'); ctx.setFontSize(24)
      ctx.fillText(`已点亮 ${total ? Math.round(learned / total * 100) : 0}% 的古诗`, W / 2, 404)

      // 里程碑徽章
      ctx.setFillStyle('#7A3E00'); ctx.setFontSize(28)
      const badgeText = badges.length
        ? '🏆 ' + badges.map(b => `学会${b.value}首`).join('  ')
        : '继续加油，点亮第一个里程碑 🏆'
      ctx.fillText(badgeText, W / 2, 464)

      // 最近点亮
      ctx.setFillStyle('#FFFFFF'); this.cardRoundRect(ctx, 48, 500, 504, 250, 28); ctx.fill()
      ctx.setFillStyle('#B5651D'); ctx.setFontSize(26); ctx.fillText('最近点亮的诗', W / 2, 548)
      ctx.setFillStyle('#2F2A1F'); ctx.setFontSize(30)
      const titleText = titles.length ? titles.map(t => `《${t}》`).join('  ') : '快去诗园点亮第一首吧'
      const wrapped = this.wrapCardText(titleText, 14)
      wrapped.slice(0, 4).forEach((line, i) => ctx.fillText(line, W / 2, 596 + i * 44))

      // 底部
      ctx.setFillStyle('#9A5B00'); ctx.setFontSize(24); ctx.fillText(`截至 ${dateText}`, W / 2, 800)
      ctx.setFillStyle('#A66A23'); ctx.setFontSize(24); ctx.fillText('和孩子一起，每天读一点古诗 📖', W / 2, 842)

      ctx.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: 'collectionCard', width: W, height: H, destWidth: W * 2, destHeight: H * 2,
          success: res => resolve(res.tempFilePath),
          fail: reject
        }, this)
      })
    })
  },

  saveCollectionCard(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: err => {
        console.warn('保存成就卡失败', err)
        wx.showToast({ title: '保存失败，请检查相册权限', icon: 'none' })
      }
    })
  },

  // 简单按字数折行，适配中文标题串
  wrapCardText(text, perLine) {
    const lines = []
    let cur = ''
    for (const ch of String(text)) {
      cur += ch
      if (cur.length >= perLine) { lines.push(cur); cur = '' }
    }
    if (cur) lines.push(cur)
    return lines
  },

  cardRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },

  formatCardDate(value) {
    const d = new Date(value)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}.${m}.${day}`
  },

  noop() {},

  onShareAppMessage(e) {
    const inviteCode = this.data.inviteCode
    const path = inviteCode ? `/pages/index/index?invite=${inviteCode}` : '/pages/index/index'
    const shareType = e && e.target && e.target.dataset ? e.target.dataset.shareType : ''
    track('share_clicked', { type: shareType || 'invite', from: 'profile' })
    // 成就卡分享：用生成的卡片图作缩略图
    if (shareType === 'card' && this.data.shareCardPath) {
      return {
        title: `我家孩子已学会 ${this.data.collectionLearned} 首古诗，一起来萌学古诗吧！`,
        path,
        imageUrl: this.data.shareCardPath
      }
    }
    return {
      title: '孩子学古诗，就用萌学古诗！趣味互动，轻松学会100首古诗',
      path
    }
  },

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
