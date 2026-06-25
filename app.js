// app.js - 萌学古诗
const api = require('./utils/api')
const audioManager = require('./utils/audio-manager')

App({
  onLaunch() {
    this.globalData.appActive = true
    this.checkForAppUpdate()
    this.installAudioErrorFilter()
    if (wx.setInnerAudioOption) {
      wx.setInnerAudioOption({ obeyMuteSwitch: false, fail: () => {} })
    }
    this.initData()
    this.initBackend()
  },

  onShow() {
    this.globalData.appActive = true
  },

  onHide() {
    this.globalData.appActive = false
    audioManager.stopAll()
  },

  onPageNotFound(res) {
    console.warn('页面不存在，已兜底回首页', res)
    const path = res && res.path ? String(res.path) : ''
    // 微信开发者工具偶发 routeDone 空路径：page "" is not found。
    // 统一兜底到首页，避免红屏影响调试。
    setTimeout(() => {
      if (!path || path === 'undefined' || path === 'null') {
        wx.reLaunch({ url: '/pages/index/index' })
      } else {
        wx.reLaunch({ url: '/pages/index/index' })
      }
    }, 50)
  },

  checkForAppUpdate() {
    if (!wx.getUpdateManager) return

    const updateManager = wx.getUpdateManager()

    updateManager.onCheckForUpdate((res) => {
      if (res && res.hasUpdate) {
        console.log('检测到小程序新版本，正在后台下载')
      }
    })

    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，重启后即可使用最新版本。',
        confirmText: '立即重启',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            updateManager.applyUpdate()
          }
        }
      })
    })

    updateManager.onUpdateFailed(() => {
      wx.showModal({
        title: '更新失败',
        content: '新版本下载失败，请删除小程序后重新打开。',
        showCancel: false,
        confirmText: '知道了'
      })
    })
  },

  installAudioErrorFilter() {
    if (this.audioErrorFilterInstalled) return
    this.audioErrorFilterInstalled = true
    if (wx.onUnhandledRejection) {
      wx.onUnhandledRejection((res) => {
        const reason = res && res.reason ? res.reason : res
        const msg = typeof reason === 'string'
          ? reason
          : ((reason && (reason.errMsg || reason.message || reason.stack)) ? (reason.errMsg || reason.message || reason.stack) : '')
        if (msg.includes('operateAudio:fail audioInstance is not set') || msg.includes('No one promise resolved')) {
          console.warn('忽略微信音频内部 Promise 错误', reason)
        }
      })
    }
  },

  initData() {
    // 业务数据以后端数据库为准；本地只保留登录 token 和临时页面参数。
  },

  initBackend() {
    if (!api.config.useBackendPoems) return

    api.login()
      .then(() => api.listAllPoems())
      .then(res => {
        if (res.items && res.items.length) {
          this.globalData.poems = res.items
          this.globalData.poemsLoadedFromBackend = true
          this.globalData.backendError = ''
          this.notifyPoemsUpdated()
        }
      })
      .catch(err => {
        this.globalData.poems = []
        this.globalData.backendError = err.message || String(err)
        this.globalData.poemsLoadedFromBackend = false
        this.notifyPoemsUpdated()
        console.warn('后端初始化失败，服务维护中', err)
      })
  },

  refreshPoemsFromBackend(params) {
    return api.listAllPoems(params)
      .then(res => {
        this.globalData.poems = res.items || []
        this.globalData.poemsLoadedFromBackend = true
        this.globalData.backendError = ''
        this.notifyPoemsUpdated()
        return res
      })
  },

  notifyPoemsUpdated() {
    const pages = getCurrentPages ? getCurrentPages() : []
    const current = pages[pages.length - 1]
    if (current && typeof current.refreshList === 'function') {
      current.refreshList()
    }
  },

  getPoems() {
    return this.globalData.poems || []
  },

  get16Poems() {
    return this.getPoems().slice(0, 16)
  },

  getPoemById(id) {
    return this.getPoems().find(p => p.id === Number(id))
  },

  globalData: {
    poems: [],
    poemsLoadedFromBackend: false,
    backendError: '',
    learnedPoemCount: 0,
    appActive: true,
    api,
    idioms: [
      { id: 1, word: '画龙点睛', pinyin: 'huà lóng diǎn jīng', meaning: '比喻在关键地方加上精辟的语句，使内容更加生动有力。', story: '梁代画家张僧繇画龙点睛，龙飞走了。', difficulty: 1 },
      { id: 2, word: '守株待兔', pinyin: 'shǒu zhū dài tù', meaning: '比喻不主动努力，希望得到意外的成功。', story: '农夫捡到撞死的兔子，天天守在树桩旁等。', difficulty: 1 },
      { id: 3, word: '刻舟求剑', pinyin: 'kè zhōu qiú jiàn', meaning: '比喻拘泥固执，不知道根据情况变化。', story: '人过江掉剑，在船舷刻记号找剑。', difficulty: 2 },
      { id: 4, word: '亡羊补牢', pinyin: 'wáng yáng bǔ láo', meaning: '比喻出了问题后及时补救。', story: '羊跑了的人赶紧修补羊圈。', difficulty: 1 },
      { id: 5, word: '掩耳盗铃', pinyin: 'yǎn ěr dào líng', meaning: '比喻自己欺骗自己。', story: '偷铃铛的人捂耳朵以为别人听不见。', difficulty: 1 },
      { id: 6, word: '胸有成竹', pinyin: 'xiōng yǒu chéng zhú', meaning: '比喻做事之前已经有完整的计划。', story: '画家画竹前心里已有竹子的形象。', difficulty: 2 },
      { id: 7, word: '画蛇添足', pinyin: 'huà shé tiān zú', meaning: '比喻多此一举，反而坏事。', story: '比赛画蛇，输的人给蛇添脚。', difficulty: 2 },
      { id: 8, word: '井底之蛙', pinyin: 'jǐng dǐ zhī wā', meaning: '比喻见识短浅的人。', story: '井里的青蛙以为天只有井口大。', difficulty: 1 },
      { id: 9, word: '狐假虎威', pinyin: 'hú jiǎ hǔ wēi', meaning: '比喻依仗别人的威势来吓唬人。', story: '狐狸借老虎的威风吓跑动物。', difficulty: 2 },
      { id: 10, word: '滥竽充数', pinyin: 'làn yú chōng shù', meaning: '比喻没有真才实学混在行家里充数。', story: '南郭先生不会吹竽却混在乐队里。', difficulty: 2 },
      { id: 11, word: '叶公好龙', pinyin: 'yè gōng hào lóng', meaning: '比喻表面上爱好某事物，实际上并不真正喜欢。', story: '叶公喜欢假龙，看到真龙却逃跑。', difficulty: 2 },
      { id: 12, word: '拔苗助长', pinyin: 'bá miáo zhù zhǎng', meaning: '比喻违反事物规律，急于求成反而坏事。', story: '农夫把禾苗往上拔，结果禾苗都枯死了。', difficulty: 1 }
    ]
  }
})
