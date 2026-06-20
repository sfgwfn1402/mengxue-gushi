// pages/learn/learn.js
const app = getApp()
const api = require('../../utils/api')
const { getAudioCandidates, pickAvailableAudio } = require('../../utils/tts')
const lineTimings = require('../../data/poem-line-timings')
const lineAudios = require('../../data/poem-line-audios')
const lineAudioDurations = require('../../data/poem-line-audio-durations')
const audioManager = require('../../utils/audio-manager')
const audioCache = require('../../utils/audio-cache')
const { ensureRecordPermission } = require('../../utils/record-permission')

const fallbackPoems = [
  { id: 1, title: '静夜思', author: '李白', dynasty: '唐', content: '床前明月光，疑是地上霜。举头望明月，低头思故乡。', audio: '/audios/poem-1.mp3', pinyin: 'chuáng qián míng yuè guāng, yí shì dì shàng shuāng.', translation: '明亮的月光洒在床前，好像地上的霜。抬起头来看明月，低下头去思念故乡。', story: '李白25岁离开家乡四川，长期漫游在外。一个深秋夜晚看到月光想起故乡。', difficulty: 1, tags: ['思乡'], season: 'autumn' },
  { id: 2, title: '春晓', author: '孟浩然', dynasty: '唐', content: '春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。', audio: '/audios/poem-2.mp3', pinyin: 'chūn mián bù jiào xiǎo, chù chù wén tí niǎo.', translation: '春天睡得很香，一觉醒来天已经亮了。到处都能听到鸟叫声。', story: '孟浩然是唐代著名的山水诗人，写春天的早晨。', difficulty: 1, tags: ['春天'], season: 'spring' },
  { id: 3, title: '登鹳雀楼', author: '王之涣', dynasty: '唐', content: '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。', audio: '/audios/poem-3.mp3', pinyin: 'bái rì yī shān jìn, huáng hé rù hǎi liú.', translation: '太阳沿着山头落下，黄河水流向大海。想看得更远，就要站得更高。', story: '王之涣在鹳雀楼上看到壮阔景色。', difficulty: 1, tags: ['风景'], season: 'any' },
  { id: 4, title: '相思', author: '王维', dynasty: '唐', content: '红豆生南国，春来发几枝。愿君多采撷，此物最相思。', audio: '/audios/poem-4.mp3', pinyin: 'hóng dòu shēng nán guó, chūn lái fā jǐ zhī.', translation: '红豆生长在南方，春天长出枝条。红豆最能代表思念。', story: '王维用红豆寄托对朋友的思念。', difficulty: 1, tags: ['思念'], season: 'spring' }
]

Page({
  data: {
    id: null,
    type: null,
    poem: null,
    idiom: null,
    learnedCount: 0,
    learnedIdiomCount: 0,
    isReading: false,
    playing: false,
    favorite: false,
    progressSynced: false,
    currentPoemLearned: false,
    poemLines: [],
    poemLineRich: [],
    currentLineIndex: -1,
    scrollIntoView: '',
    recitations: [],
    recording: false,
    recorderStarted: false,
    recordFilePath: '',
    recordDuration: 0,
    uploadingRecitation: false,
    playingRecitationId: '',
    previewingRecord: false,
    featuredRecitation: null,
    playingFeatured: false,
    followLineIndex: 0,
    followLines: [],
    followLineTimings: [],
    followLineDone: [],
    followCompletedCount: 0,
    followRecording: false,
    followRecorderStarted: false,
    followLastDuration: 0,
    followAllDone: false,
    followExpanded: false,
    followAutoMode: false,
    followWaitingRead: false,
    followPhase: 'idle',
    followLineRecordPath: '',
    followDebug: '',
    lineTiming: null,
    lineAudio: null,
    childExplain: '',
    pictureGuide: '',
    parentQuestions: [],
    parentGuideExpanded: false,
    followPlayingLine: false,
    landscapeFollowVisible: false,
    isLandscapeViewport: false
  },

  onReady() {
    this.pageActive = true
    this.initAudio()
  },

  onShow() {
    this.pageActive = true
    if (app.globalData) app.globalData.appActive = true
  },

  recreateAudio() {
    if (this.recorder && (this.data.recording || this.data.recorderStarted)) {
      try { this.recorder.stop() } catch (e) {}
    }
    if (this.audio) {
      try { this.audio.destroy() } catch (e) {}
      this.audio = null
    }
    this.initAudio()
  },

  initAudio() {
    if (this.audio) return

    this.audio = audioManager.create('learn-main')

    this.audio.onTimeUpdate(() => {
      this.updateReadingLineByAudioTime()
      this.stopFollowLineAtEnd()
    })

    this.audio.onEnded(() => {
      if (this.data.followAutoMode && this.data.followPhase === 'playing') {
        this.clearFollowLineTimer()
        this.beginFollowRecordingPrompt()
      } else {
        this.finishReading()
      }
    })

    this.audio.onStop(() => {
      this.clearReadingTimer()
      this.setData({ isReading: false, playing: false, currentLineIndex: -1, scrollIntoView: '', followPlayingLine: false })
    })

    this.audio.onError((err) => {
      const msg = err && err.errMsg ? err.errMsg : ''
      if (msg.includes('audioInstance is not set')) {
        console.warn('忽略旧音频实例回调', err)
      } else {
        console.warn('朗读播放失败', err, this.audio && this.audio.src ? this.audio.src : '')
        wx.showToast({ title: '朗读失败，请稍后再试', icon: 'none' })
      }
      this.clearReadingTimer()
      this.setData({ isReading: false, playing: false, currentLineIndex: -1, scrollIntoView: '', followPlayingLine: false })
    })
  },

  nextReadingTask() {
    this.readingTaskId = (this.readingTaskId || 0) + 1
    return this.readingTaskId
  },

  toggleParentGuide() {
    this.setData({ parentGuideExpanded: !this.data.parentGuideExpanded })
  },

  canPlayAudio() {
    return !!this.pageActive && (!app.globalData || app.globalData.appActive !== false)
  },

  onLoad(options) {
    const { id, type } = options
    this.setData({ id: parseInt(id), type })
    this.loadData()
    // 域名 HTTPS 偶发 reset，页面初始化请求分批发，避免瞬时并发过高。
    setTimeout(() => this.updateProgress(), 80)
    setTimeout(() => this.syncReadProgress(), 220)
    setTimeout(() => this.syncFavoriteStatus(), 360)
    setTimeout(() => this.loadCurrentPoemProgress(), 500)
    setTimeout(() => this.loadRecitations(), 650)
    setTimeout(() => this.loadFeaturedRecitation(), 800)
    if (options.follow === '1') {
      setTimeout(() => this.openLandscapeFollow(), 500)
    }
  },

  loadData() {
    const { id, type } = this.data
    if (type === 'poem') {
      const appPoems = app && app.getPoems ? app.getPoems() : (app && app.globalData && app.globalData.poems ? app.globalData.poems : [])
      const poems = appPoems && appPoems.length ? appPoems : fallbackPoems
      const poem = poems.find(p => Number(p.id) === Number(id))
      if (poem) {
        this.renderPoem(poem)
        return
      }

      api.getPoem(id)
        .then(poem => this.renderPoem(poem))
        .catch(err => {
          console.warn('按ID读取古诗失败', err)
          wx.showToast({ title: '未找到古诗', icon: 'none' })
        })
      return
    } else {
      const idioms = app && app.globalData ? app.globalData.idioms : []
      const idiom = idioms.find(i => i.id === id)
      if (!idiom) {
        wx.showToast({ title: '未找到成语', icon: 'none' })
        return
      }
      this.setData({ idiom })
      wx.setNavigationBarTitle({ title: idiom.word })
    }
  },

  renderPoem(poem) {
    const poemLines = this.splitPoemLines(poem.content)
    const poemLineRich = this.buildPoemLineRich(poem, poemLines)
    const lineTiming = lineTimings[String(poem.id)] || null
    const followLines = this.getFollowLines(poem, poemLines)
    const followLineTimings = this.getFollowLineTimings(poem, followLines, lineTiming)
    const childGuide = this.buildChildGuide(poem)
    this.setData({
      poem,
      poemLines,
      poemLineRich,
      followLines,
      followLineTimings,
      childExplain: childGuide.explain,
      pictureGuide: childGuide.picture,
      parentQuestions: childGuide.questions,
      parentGuideExpanded: false,
      currentLineIndex: -1,
      scrollIntoView: '',
      followLineIndex: 0,
      followLineDone: followLines.map(() => false),
      followCompletedCount: 0,
      followLastDuration: 0,
      followAllDone: false,
      followExpanded: false,
      followAutoMode: false,
      followWaitingRead: false,
      followPhase: 'idle',
      followLineRecordPath: '',
      followDebug: '',
      lineTiming,
      lineAudio: lineAudios[String(poem.id)] || null,
      followPlayingLine: false
    })
    wx.setNavigationBarTitle({ title: poem.title })
    try {
      wx.setStorageSync('lastLearnPoem', {
        id: poem.id,
        title: poem.title,
        author: poem.author,
        dynasty: poem.dynasty,
        content: poem.content,
        imageUrl: poem.imageUrl || '',
        updatedAt: Date.now()
      })
    } catch (e) {}
  },

  updateProgress() {
    api.getStats()
      .then(stats => {
        this.setData({
          learnedCount: stats.learned_poem_count || 0,
          learnedIdiomCount: stats.learned_idiom_count || 0
        })
      })
      .catch(err => console.warn('读取学习进度统计失败', err))
  },

  loadCurrentPoemProgress() {
    const { id, type } = this.data
    if (type !== 'poem' || !id) return

    api.listProgress()
      .then(items => {
        const current = (items || []).find(item => Number(item.poem_id || item.poemId) === Number(id))
        this.setData({ currentPoemLearned: !!(current && current.learned) })
      })
      .catch(err => console.warn('读取当前古诗学习状态失败', err))
  },

  completePoemTask() {
    const task = this.data.currentPoemLearned
      ? { id: 'review3', stars: 2, toast: '今日复习完成' }
      : { id: 'learn1', stars: 3, toast: '今日学习完成' }

    return api.completeTask(task.id, task.stars)
      .then(res => {
        const added = res && typeof res.stars_added === 'number' ? res.stars_added : 0
        return { ...task, starsAdded: added }
      })
  },

  splitPoemLines(content) {
    const text = Array.isArray(content) ? content.join('') : String(content || '')
    const lines = []
    let buf = ''
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      buf += ch
      if ('，。！？；、,.!?;'.includes(ch)) {
        const line = buf.trim()
        if (line) lines.push(line)
        buf = ''
      }
    }
    const tail = buf.trim()
    if (tail) lines.push(tail)
    return lines.length ? lines : [text]
  },

  buildPoemLineRich(poem, poemLines) {
    const annotated = Array.isArray(poem.annotatedContent) ? poem.annotatedContent : []
    if (!annotated.length) return []

    const lines = []
    let current = []
    annotated.forEach(item => {
      const ch = item.char || ''
      if (!ch) return
      current.push({
        char: ch,
        pinyin: item.pinyin || '',
        punct: !!item.punct
      })
      if ('，。！？；、,.!?;'.includes(ch)) {
        lines.push(current)
        current = []
      }
    })
    if (current.length) lines.push(current)

    // 后端逐字注音和正文行数不一致时，为了不影响显示，退回普通正文。
    return lines.length === poemLines.length ? lines : []
  },

  getFollowLines(poem, poemLines) {
    // 官方朗读/正文高亮按标点显示；跟读可以按孩子更自然的节奏重新分组。
    if (Number(poem && poem.id) === 9) {
      return ['鹅，鹅，鹅，', '曲项向天歌。', '白毛浮绿水，', '红掌拨清波。']
    }
    return poemLines
  },

  getFollowLineTimings(poem, followLines, lineTiming) {
    if (poem && poem.followTimings && poem.followTimings.length) {
      return poem.followTimings
    }
    if (Number(poem && poem.id) === 9) {
      return [
        { index: 0, text: '鹅，鹅，鹅，', start: 7.55, end: 9.45 },
        { index: 1, text: '曲项向天歌。', start: 10.25, end: 13.75 },
        { index: 2, text: '白毛浮绿水，', start: 14.95, end: 17.75 },
        { index: 3, text: '红掌拨清波。', start: 18.25, end: 22.05 }
      ]
    }
    const timingLines = lineTiming && lineTiming.lines ? lineTiming.lines : []
    return followLines.map((line, index) => Object.assign({ index, text: line }, timingLines[index] || {}))
  },

  buildChildGuide(poem) {
    const title = poem && poem.title ? poem.title : '这首诗'
    const translation = poem && poem.translation ? poem.translation : ''
    const story = poem && poem.story ? poem.story : ''
    const tags = poem && poem.tags ? poem.tags : []
    const tagText = Array.isArray(tags) && tags.length ? tags.slice(0, 3).join('、') : '画面和心情'
    const explain = translation || story || `${title}是一首适合孩子慢慢听、慢慢读的古诗。先听声音，再看画面，最后试着自己读出来。`
    const picture = story || `读这首诗时，可以让孩子想一想：诗里有什么？在哪里？诗人当时是什么心情？重点感受“${tagText}”。`
    const questions = [
      `这首诗里你听到了什么？`,
      `你脑海里看到了什么画面？`,
      `你觉得诗人当时开心、想念、安静还是勇敢？`
    ]
    return { explain, picture, questions }
  },

  clearReadingTimer() {
    if (this.readingTimer) {
      clearInterval(this.readingTimer)
      this.readingTimer = null
    }
  },

  startReadingFallbackTimer(taskId) {
    this.clearReadingTimer()
    this.readingTimer = setInterval(() => {
      if (taskId !== this.readingTaskId || !this.data.playing) {
        this.clearReadingTimer()
        return
      }
      this.updateReadingLineByAudioTime()
    }, 300)
  },

  updateReadingLineByAudioTime() {
    const { type, poemLines, playing } = this.data
    if (type !== 'poem' || !playing || !poemLines || !poemLines.length || !this.audio) return

    const duration = Number(this.audio.duration || 0)
    const currentTime = Number(this.audio.currentTime || 0)
    const lineCount = poemLines.length
    let index = 0

    const timingLines = this.data.lineTiming && this.data.lineTiming.lines
    if (timingLines && timingLines.length) {
      const matched = timingLines.findIndex(line => currentTime >= line.start && currentTime <= line.end)
      if (matched >= 0) {
        index = matched
      } else {
        const next = timingLines.findIndex(line => currentTime < line.start)
        index = next >= 0 ? Math.max(0, next - 1) : timingLines.length - 1
      }
    } else if (duration > 0) {
      index = Math.min(lineCount - 1, Math.floor((currentTime / duration) * lineCount))
    } else {
      index = this.data.currentLineIndex < 0 ? 0 : this.data.currentLineIndex
    }

    if (index !== this.data.currentLineIndex) {
      this.setData({
        currentLineIndex: index,
        scrollIntoView: `poem-line-${index}`
      })
    }
  },

  finishReading() {
    this.clearReadingTimer()
    const lastIndex = this.data.poemLines && this.data.poemLines.length ? this.data.poemLines.length - 1 : -1
    this.setData({
      isReading: false,
      playing: false,
      followPlayingLine: false,
      currentLineIndex: lastIndex,
      scrollIntoView: lastIndex >= 0 ? `poem-line-${lastIndex}` : ''
    })
    this.syncReadProgress()
  },

  async readAloud() {
    const { type, poem, idiom, playing } = this.data
    
    if (playing) {
      this.stopReading()
      return
    }
    this.stopFollowAudio()
    
    const item = type === 'poem' ? poem : idiom
    const candidates = getAudioCandidates(type, item)
    
    if (!candidates.length) {
      wx.showToast({
        title: '暂无朗读音频',
        icon: 'none'
      })
      return
    }

    const taskId = this.nextReadingTask()
    wx.showLoading({ title: '加载音频...' })
    const remoteAudioPath = await pickAvailableAudio(candidates)
    let audioPath = remoteAudioPath
    try {
      // 真机 InnerAudioContext 直播 HTTPS 偶发 TLS -1200/-1005；先下载到本地再播更稳。
      audioPath = await audioCache.downloadAudio(remoteAudioPath)
    } catch (err) {
      console.warn('朗读音频下载失败，尝试直接播放远程 URL', err, remoteAudioPath)
      audioPath = remoteAudioPath
    }
    wx.hideLoading()

    if (!audioPath) {
      wx.showToast({
        title: '缺少音频文件',
        icon: 'none'
      })
      return
    }

    if (taskId !== this.readingTaskId) {
      return
    }
    this.setData({ isReading: true, playing: true, currentLineIndex: type === 'poem' ? 0 : -1, scrollIntoView: type === 'poem' ? 'poem-line-0' : '' })

    try {
      if (taskId !== this.readingTaskId) {
        return
      }

      this.recreateAudio()
      this.audio.src = audioPath
      setTimeout(() => {
        if (this.canPlayAudio() && taskId === this.readingTaskId && this.audio) {
          audioManager.playWithRetry(this.audio, {
            attempts: 4,
            delay: 260,
            shouldContinue: () => this.canPlayAudio() && taskId === this.readingTaskId && !!this.audio && this.data.playing
          })
        }
      }, 120)
      if (type === 'poem') {
        this.startReadingFallbackTimer(taskId)
      }
    } catch (err) {
      console.error('语音合成失败', err)
      this.setData({ isReading: false, playing: false })
      wx.showToast({
        title: err.message || '朗读音频播放失败',
        icon: 'none'
      })
    }
  },

  stopReading(options = {}) {
    // 强制取消官方朗读：防止异步加载完成后旧 audio 又继续播放。
    // 页面隐藏/卸载时不要重建 audio，否则可能留下新的空实例继续接收异步回调。
    const { recreate = true } = options
    this.nextReadingTask()
    this.clearReadingTimer()
    if (this.audio) {
      try { this.audio.stop() } catch (e) {}
      try { this.audio.destroy() } catch (e) {}
      this.audio = null
    }
    if (recreate && this.pageActive) this.initAudio()
    this.setData({
      isReading: false,
      playing: false,
      currentLineIndex: -1,
      scrollIntoView: '',
      followPlayingLine: false
    })
  },


  toggleFollowExpanded() {
    const next = !this.data.followExpanded
    this.setData({ followExpanded: next })
    if (next) wx.showToast({ title: '开始一句一句跟读吧', icon: 'none' })
  },

  updateViewportMode() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      this.setData({ isLandscapeViewport: Number(info.windowWidth || 0) > Number(info.windowHeight || 0) })
    } catch (e) {}
  },

  openLandscapeFollow() {
    if (this.data.type !== 'poem' || !this.data.poem) return
    this.updateViewportMode()
    this.resetFollowSession()
    this.setData({ landscapeFollowVisible: true, followExpanded: true })
    if (wx.setPageOrientation) {
      wx.setPageOrientation({ orientation: 'landscape', fail: err => console.warn('切换横屏失败', err) })
    }
    setTimeout(() => this.updateViewportMode(), 350)
  },

  resetFollowSession() {
    audioManager.stopAll()
    this.stopReading()
    this.stopFollowAudio(true)
    this.clearFollowLineTimer()
    this.destroyFollowPreviewAudio && this.destroyFollowPreviewAudio()
    if (this.followRecorder && (this.data.followRecording || this.data.followRecorderStarted)) {
      try { this.followRecorder.stop() } catch (e) {}
    }
    const poemLines = this.data.poemLines || []
    const followLines = this.data.followLines || poemLines
    this.followRecordStartAt = 0
    this.setData({
      followLineIndex: 0,
      currentLineIndex: 0,
      scrollIntoView: poemLines.length ? 'poem-line-0' : '',
      followLineDone: followLines.map(() => false),
      followCompletedCount: 0,
      followRecording: false,
      followRecorderStarted: false,
      followLastDuration: 0,
      followAllDone: false,
      followAutoMode: false,
      followWaitingRead: false,
      followPhase: 'idle',
      followLineRecordPath: '',
      followDebug: '',
      followPlayingLine: false
    })
  },

  closeLandscapeFollow() {
    this.cleanupFollowSession()
    this.setData({ landscapeFollowVisible: false })
    if (wx.setPageOrientation) {
      wx.setPageOrientation({ orientation: 'portrait', fail: err => console.warn('恢复竖屏失败', err) })
    }
  },

  cleanupFollowSession() {
    this.clearFollowLineTimer()
    this.stopFollowAudio(true)
    this.destroyFollowPreviewAudio && this.destroyFollowPreviewAudio()
    if (this.followRecorder && (this.data.followRecording || this.data.followRecorderStarted)) {
      try { this.followRecorder.stop() } catch (e) {}
    }
    audioManager.destroy('learn-follow-line')
    audioManager.destroy('learn-follow-preview')
    audioManager.stopAll()
    this.setData({
      followAutoMode: false,
      followWaitingRead: false,
      followPlayingLine: false,
      followRecording: false,
      followRecorderStarted: false,
      followPhase: 'idle'
    })
  },

  nextFollowFlowToken() {
    this.followFlowToken = (this.followFlowToken || 0) + 1
    return this.followFlowToken
  },

  isCurrentFollowFlow(token) {
    return !token || token === this.followFlowToken
  },

  skipFollowLine() {
    // “下一句”是强制切换：废掉当前重听/录音/回放的旧异步回调，再进入下一句并自动朗读。
    this.nextFollowFlowToken()
    this.stopCurrentFollowActivity()
    this.completeFollowLine(true)
  },

  replayCurrentFollowLine() {
    // “重听”是当前句的强制重播：先废掉录音/回放/旧标准音频流程，再播放当前句。
    const token = this.nextFollowFlowToken()
    this.stopCurrentFollowActivity()
    this.setData({
      followAutoMode: true,
      followPhase: 'playing',
      followLineRecordPath: '',
      followWaitingRead: false
    })
    setTimeout(() => this.playFollowLine(token), 80)
  },

  startFollowAuto() {
    wx.showToast({ title: '开始跟读', icon: 'none' })
    if (!(this.data.followLines || this.data.poemLines || []).length) return
    this.stopReading()
    this.stopFollowAudio()
    this.clearFollowLineTimer()
    this.setData({ followExpanded: true, followAutoMode: true, followWaitingRead: false, followPhase: 'playing' })
    this.playFollowLine()
  },

  playFollowCue() {
    // 轻量提示：震动 + toast。后续可换成真正提示音文件。
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    wx.showToast({ title: '轮到你读啦', icon: 'none', duration: 900 })
  },


  forceFollowRecording() {
    wx.showToast({ title: '开始录音', icon: 'none' })
    this.stopFollowAudio(true)
    this.beginFollowRecordingPrompt()
  },

  handleFollowMainAction() {
    const { followPhase, followRecording, followRecorderStarted, followAutoMode } = this.data
    if (followPhase === 'playing') {
      // 标准音频播放中点击按钮：提前进入“等待录音”。
      this.stopFollowAudio(true)
      this.beginFollowRecordingPrompt()
      return
    }
    if (followPhase === 'recording') {
      // 录音阶段：系统会自动开始录音，用户点击按钮只负责“完成录音”。
      if (followRecording || followRecorderStarted) {
        this.stopFollowRecord()
      }
      return
    }
    if (followPhase === 'preview') return
    if (followPhase === 'done') {
      this.setData({
        followLineIndex: 0,
        currentLineIndex: 0,
        followLineDone: (this.data.followLines || this.data.poemLines || []).map(() => false),
        followCompletedCount: 0,
        followAllDone: false,
        followAutoMode: true,
        followPhase: 'idle',
        followLineRecordPath: ''
      })
      return
    }
    if (followAutoMode) {
      this.setData({ followPhase: 'playing', followLineRecordPath: '' })
      this.playFollowLine()
      return
    }
    this.startFollowAuto()
  },

  followMainButtonText() {
    const phase = this.data.followPhase
    if (phase === 'playing') return '正在听标准朗读…'
    if (phase === 'recording') return '完成'
    if (phase === 'preview') return '正在回放你的声音…'
    if (phase === 'done') return '再练一次'
    return '开始'
  },

  previewFollowLineRecord(recordPath, flowToken) {
    const flow = flowToken || this.followFlowToken
    if (!this.isCurrentFollowFlow(flow)) return
    const path = recordPath || this.data.followLineRecordPath
    if (!path) {
      console.warn('逐句跟读回放缺少录音路径', { recordPath, dataPath: this.data.followLineRecordPath })
      wx.showToast({ title: '没有录到声音', icon: 'none' })
      this.completeFollowLine(true)
      return
    }
    // 回放孩子录音时，只停止标准跟读音频；不要复用旧回放实例，避免 stop 回调把回放打断。
    this.stopFollowAudio(true)
    this.destroyFollowPreviewAudio()
    const previewToken = Date.now() + '-' + Math.random()
    this.followPreviewToken = previewToken
    const audio = wx.createInnerAudioContext()
    audio.obeyMuteSwitch = false
    audio.volume = 1
    this.followPreviewAudio = audio
    const previewStartedAt = Date.now()
    audio.onEnded(() => {
      if (this.followPreviewToken !== previewToken) return
      const minMs = Math.max(800, Number(this.data.followLastDuration || 1) * 1000 - 200)
      const elapsed = Date.now() - previewStartedAt
      const finishPreview = () => {
        if (this.followPreviewToken !== previewToken) return
        // 录音回放结束后继续自动进入下一句并播放下一句标准音频。
        this.completeFollowLine(true)
      }
      if (elapsed < minMs) {
        console.warn('逐句跟读回放过早结束，延迟完成回放', { elapsed, minMs, path })
        setTimeout(finishPreview, minMs - elapsed)
        return
      }
      finishPreview()
    })
    audio.onStop(() => {})
    audio.onPlay(() => {
      if (this.followPreviewToken !== previewToken) return
      this.followPreviewActuallyPlayed = true
      console.log('逐句跟读录音回放开始', path)
    })
    audio.onCanplay(() => {
      if (this.followPreviewToken !== previewToken || this.followPreviewPlayed) return
      this.followPreviewPlayed = true
      console.log('逐句跟读录音可播放', path)
      audioManager.playWithRetry(audio, {
        attempts: 3,
        delay: 220,
        shouldContinue: () => this.followPreviewToken === previewToken && this.followPreviewAudio === audio && this.data.followPhase === 'preview'
      })
    })
    audio.onError((err) => {
      if (this.followPreviewToken !== previewToken) return
      console.warn('逐句跟读回放失败', err, path)
      wx.showToast({ title: '回放失败，进入下一句', icon: 'none' })
      this.completeFollowLine(true)
    })
    this.followPreviewPlayed = false
    this.followPreviewActuallyPlayed = false
    audio.src = path
    const doPlay = () => {
      if (!this.canPlayAudio()) return
      setTimeout(() => {
        if (this.followPreviewToken !== previewToken || this.followPreviewAudio !== audio || this.data.followPhase !== 'preview') return
        if (this.followPreviewPlayed) return
        this.followPreviewPlayed = true
        console.log('准备播放逐句跟读录音（兜底）', path)
        audioManager.playWithRetry(audio, {
          attempts: 3,
          delay: 220,
          shouldContinue: () => this.followPreviewToken === previewToken && this.followPreviewAudio === audio && this.data.followPhase === 'preview'
        })
      }, 600)
    }
    try {
      wx.getFileSystemManager().access({
        path,
        success: () => {
          try {
            wx.getFileSystemManager().getFileInfo({
              filePath: path,
              success: info => console.log('逐句跟读录音文件信息', { path, size: info.size })
            })
          } catch (e) {}
          doPlay()
        },
        fail: (err) => {
          console.warn('逐句跟读录音文件不存在/不可读', path, err)
          wx.showToast({ title: '录音文件不可读', icon: 'none' })
          this.completeFollowLine(true)
        }
      })
    } catch (e) {
      doPlay()
    }
  },

  destroyFollowPreviewAudio() {
    if (this.followPreviewAudio) {
      const old = this.followPreviewAudio
      this.followPreviewAudio = null
      this.followPreviewToken = ''
      try { audioManager.ignoreAudioPromise(old.stop && old.stop()) } catch (e) {}
      try { audioManager.ignoreAudioPromise(old.destroy && old.destroy()) } catch (e) {}
    }
  },

  stopCurrentFollowActivity() {
    this.clearFollowLineTimer()
    this.followPromptStarted = true
    this.stopFollowAudio(true)
    this.destroyFollowPreviewAudio && this.destroyFollowPreviewAudio()
    if (this.followRecorder && (this.data.followRecording || this.data.followRecorderStarted)) {
      try { this.followRecorder.stop() } catch (e) {}
    }
    this.setData({
      followRecording: false,
      followRecorderStarted: false,
      followLineRecordPath: '',
      followPhase: 'idle',
      followPlayingLine: false
    })
  },

  selectFollowLine(e) {
    const index = Number(e.currentTarget.dataset.index || 0)
    const followLines = this.data.followLines || this.data.poemLines || []
    if (index < 0 || index >= followLines.length) return
    this.nextFollowFlowToken()
    this.stopCurrentFollowActivity()
    this.setData({
      followAutoMode: true,
      followLineIndex: index,
      currentLineIndex: index,
      scrollIntoView: `poem-line-${index}`,
      followPhase: 'playing'
    })
    setTimeout(() => this.playFollowLine(), 80)
  },


  initFollowAudio() {
    // 标准跟读音频复用同一个实例；切句只 stop + 换 src，不 destroy，避免微信 SDK 内部 Promise 影响实际出声。
    if (this.followAudio) return this.followAudio
    const audio = wx.createInnerAudioContext()
    audio.obeyMuteSwitch = false
    audio.volume = 1
    this.followAudio = audio
    audio.onEnded(() => {
      if (this.data.followPhase === 'playing') this.beginFollowRecordingPrompt(this.currentFollowPlayFlowToken)
    })
    audio.onStop(() => {})
    audio.onPlay(() => {
      const audioPath = this.currentFollowAudioPath || ''
      console.log('逐句音频开始播放', audioPath)
      this.setData({ followDebug: '播放中：' + audioPath })
    })
    audio.onCanplay(() => {
      console.log('逐句音频可播放', this.currentFollowAudioPath || '')
    })
    audio.onWaiting(() => {
      this.setData({ followDebug: '音频缓冲中：' + (this.currentFollowAudioPath || '') })
    })
    audio.onError((err) => {
      const msg = err && err.errMsg ? err.errMsg : ''
      if (msg.includes('audioInstance is not set') || msg.includes('No one promise resolved')) {
        console.warn('忽略旧跟读音频停止回调', err)
        return
      }
      console.warn('逐句标准音频播放失败', err, this.currentFollowAudioPath || '')
      this.setData({ followDebug: '播放失败：' + msg })
      wx.showToast({ title: '句子音频播放失败', icon: 'none' })
      setTimeout(() => this.beginFollowRecordingPrompt(this.currentFollowPlayFlowToken), 500)
    })
    return audio
  },

  destroyFollowAudio() {
    if (this.followAudio) {
      const old = this.followAudio
      this.followAudio = null
      try { audioManager.ignoreAudioPromise(old.stop && old.stop()) } catch (e) {}
      try { audioManager.ignoreAudioPromise(old.destroy && old.destroy()) } catch (e) {}
    }
  },

  stopFollowAudio(destroyOnly) {
    this.clearFollowLineTimer()
    if (this.followAudio) {
      try { audioManager.ignoreAudioPromise(this.followAudio.stop && this.followAudio.stop()) } catch (e) {}
    }
    if (!destroyOnly) {
      this.setData({ followPlayingLine: false })
    }
  },

  async playFollowLine(flowToken) {
    const token = flowToken || this.nextFollowFlowToken()
    const { poem, poemLines, followLines, followLineIndex } = this.data
    const activeFollowLines = followLines && followLines.length ? followLines : poemLines
    if (!activeFollowLines.length) return
    this.stopReading()
    this.stopFollowAudio()
    this.clearFollowLineTimer()

    const taskId = this.nextReadingTask()
    // 跟读只播放切好的单句音频：MinIO IP / line-audios/poem-{id}-line-{n}.mp3
    // 不影响、不复用朗读整首音频。
    const lineAudioItem = this.data.lineAudio && this.data.lineAudio.lines ? this.data.lineAudio.lines[followLineIndex] : null
    const lineAudioVersionValue = (poem && (poem.audioVersion || poem.audio_version)) || (poem && poem.id === 33 ? '20260620-real-v4' : '')
    const lineAudioVersion = lineAudioVersionValue ? `?v=${lineAudioVersionValue}` : ''
    const lineAudioUrl = lineAudioItem && lineAudioItem.url ? `${api.config.minioBaseUrl}/${lineAudioItem.url}${lineAudioVersion}` : ''
    let audioPath = lineAudioUrl
    if (!this.isCurrentFollowFlow(token)) return
    if (!audioPath) {
      wx.showToast({ title: '跟读音频准备中', icon: 'none' })
      this.setData({ followDebug: '缺少跟读单句音频：poem-' + (poem && poem.id) + '-line-' + (followLineIndex + 1) })
      return
    }

    this.setData({
      currentLineIndex: followLineIndex,
      scrollIntoView: `poem-line-${followLineIndex}`,
      followPhase: 'playing',
      followDebug: audioPath
    })

    const audio = this.initFollowAudio()
    const timingLine = this.data.followLineTimings && this.data.followLineTimings.length
      ? this.data.followLineTimings[followLineIndex]
      : (this.data.lineTiming && this.data.lineTiming.lines ? this.data.lineTiming.lines[followLineIndex] : null)
    const hasWholePoemAudio = false
    this.followPromptStarted = false
    try {
      audioPath = await audioCache.downloadAndCache(lineAudioUrl, { tag: 'follow-line-audio', retries: 4, timeout: 60000 })
    } catch (err) {
      console.warn('跟读音频缓存失败', err, lineAudioUrl)
      if (!this.canPlayAudio()) {
        this.setData({ followPhase: 'idle', followDebug: '音频下载超时，请回到小程序前台后重试' })
        return
      }
      wx.showToast({ title: '网络超时，重听试试', icon: 'none' })
      this.setData({ followPhase: 'idle', followDebug: '跟读音频下载超时：' + lineAudioUrl })
      return
    }
    if (!this.isCurrentFollowFlow(token) || !this.canPlayAudio()) return
    this.currentFollowAudioPath = audioPath
    this.currentFollowPlayFlowToken = token
    audio.startTime = 0
    audio.src = audioPath

    // 分句播放：单句 mp3 必须等它完整播完，不能再用固定 4 秒截断。
    const audioFileName = lineAudioItem && lineAudioItem.url ? lineAudioItem.url.split('/').pop().split('?')[0] : ''
    const durationSec = audioFileName ? Number(lineAudioDurations[audioFileName] || 0) : 0
    const timingSec = timingLine && typeof timingLine.start === 'number' && typeof timingLine.end === 'number'
      ? Math.max(0, Number(timingLine.end) - Number(timingLine.start))
      : 0
    const lineMs = Math.max(1200, Math.ceil(Math.max(durationSec, timingSec) * 1000) + 650)
    this.followLineTimer = setTimeout(() => {
      if (this.isCurrentFollowFlow(token) && taskId === this.readingTaskId && this.data.followAutoMode && this.data.followPhase === 'playing' && !this.followPromptStarted) {
        this.setData({ followDebug: `本句播放完成：${audioFileName || audioPath}` })
        this.beginFollowRecordingPrompt(token)
      }
    }, lineMs)

    try {
      if (!this.canPlayAudio()) return
      setTimeout(() => {
        if (!this.isCurrentFollowFlow(token) || this.followAudio !== audio || this.data.followPhase !== 'playing') return
        audioManager.playWithRetry(audio, {
          attempts: 4,
          delay: 260,
          shouldContinue: () => this.isCurrentFollowFlow(token) && this.followAudio === audio && this.data.followPhase === 'playing'
        })
      }, 120)
    } catch (err) {
      console.warn('audio.play 抛错', err)
      this.setData({ followDebug: 'play 抛错：' + err.message })
      this.beginFollowRecordingPrompt()
    }
  },

  clearFollowLineTimer() {
    if (this.followLineTimer) {
      clearTimeout(this.followLineTimer)
      this.followLineTimer = null
    }
  },

  beginFollowRecordingPrompt(flowToken) {
    const token = flowToken || this.followFlowToken
    if (!this.isCurrentFollowFlow(token)) return
    if (this.followPromptStarted) return
    this.followPromptStarted = true
    this.clearReadingTimer()
    this.clearFollowLineTimer()
    this.followLineEndAt = 0
    this.stopFollowAudio(true)
    this.setData({
      isReading: false,
      playing: false,
      followPlayingLine: false,
      followWaitingRead: true,
      followPhase: 'recording'
    })
    this.playFollowCue()
    // 系统提示后自动开始录音；用户只需要点击“完成录音”。
    setTimeout(() => {
      if (this.isCurrentFollowFlow(token) && this.data.followPhase === 'recording' && !this.data.followRecording && !this.data.followRecorderStarted) {
        this.startFollowRecord(token)
      }
    }, 450)
  },

  stopFollowLineAtEnd() {
    // 跟读现在播放的是已切好的单句 mp3，不再用整首音频 currentTime 截停，避免没读完就断。
  },

  toggleFollowRecord() {
    if (this.data.followRecording || this.data.followRecorderStarted) {
      this.stopFollowRecord()
    } else {
      this.startFollowRecord()
    }
  },

  getFollowRecorder() {
    if (!this.followRecorder) {
      this.followRecorder = wx.getRecorderManager()
      this.followRecorder.onStart(() => {
        this.followRecordStartAt = Date.now()
        this.setData({ followRecording: true, followRecorderStarted: true, followLastDuration: 0, followPhase: 'recording' })
      })
      this.followRecorder.onStop((res) => {
        const recordToken = this.currentRecordingFlowToken
        const recordPath = res.tempFilePath || ''
        const duration = res.duration ? Math.round(res.duration / 1000) : Math.max(1, Math.round((Date.now() - (this.followRecordStartAt || Date.now())) / 1000))
        if (!this.isCurrentFollowFlow(recordToken)) {
          console.warn('忽略旧跟读录音停止回调', { recordPath, duration, recordToken, current: this.followFlowToken })
          return
        }
        console.log('逐句跟读录音完成', { recordPath, duration, raw: res })
        this.setData({
          followRecording: false,
          followRecorderStarted: false,
          followLastDuration: duration,
          followWaitingRead: false,
          followPhase: 'preview',
          followLineRecordPath: recordPath
        })
        wx.showToast({ title: '听听你读得怎么样', icon: 'none' })
        // 只要录到了声音，就必须回放；不要依赖 followAutoMode，最后一句/重听场景下该状态可能不稳定。
        setTimeout(() => {
          if (!this.isCurrentFollowFlow(recordToken)) return
          console.log('准备进入逐句跟读录音回放', { recordPath, phase: this.data.followPhase })
          this.previewFollowLineRecord(recordPath, recordToken)
        }, 500)
      })
      this.followRecorder.onError((err) => {
        console.warn('逐句跟读录音失败', err)
        this.setData({ followRecording: false, followRecorderStarted: false })
        wx.showToast({ title: '录音失败，请检查权限', icon: 'none' })
      })
    }
    return this.followRecorder
  },

  startFollowRecord(flowToken) {
    const token = flowToken || this.followFlowToken
    if (!this.isCurrentFollowFlow(token)) return
    if (this.data.type !== 'poem') return
    this.stopReading()
    this.destroyFollowPreviewAudio && this.destroyFollowPreviewAudio()
    const begin = () => {
      try {
        this.currentRecordingFlowToken = token
        this.getFollowRecorder().start({
          duration: 15000,
          sampleRate: 44100,
          numberOfChannels: 1,
          encodeBitRate: 96000,
          format: 'aac'
        })
      } catch (err) {
        console.warn('启动逐句跟读失败', err)
        wx.showToast({ title: '录音启动失败', icon: 'none' })
      }
    }
    ensureRecordPermission({
      title: '需要麦克风权限',
      content: '请允许麦克风权限，才能一句一句跟读。',
      success: begin,
      fail: () => wx.showToast({ title: '未开启麦克风权限', icon: 'none' })
    })
  },

  stopFollowRecord() {
    if (this.followRecorder && (this.data.followRecording || this.data.followRecorderStarted)) {
      try { this.followRecorder.stop() } catch (err) { console.warn('停止逐句跟读失败', err) }
    }
  },

  completeFollowLine(autoNext) {
    const { followLineIndex, followLineDone, poemLines, followLines, followAutoMode } = this.data
    const activeFollowLines = followLines && followLines.length ? followLines : poemLines
    if (!activeFollowLines.length) return
    const done = followLineDone.slice()
    if (!done[followLineIndex]) done[followLineIndex] = true
    const completed = done.filter(Boolean).length
    const allDone = completed >= activeFollowLines.length
    const nextIndex = allDone ? followLineIndex : Math.min(activeFollowLines.length - 1, followLineIndex + 1)
    this.setData({
      followLineDone: done,
      followCompletedCount: completed,
      followLineIndex: nextIndex,
      currentLineIndex: nextIndex,
      scrollIntoView: `poem-line-${nextIndex}`,
      followAllDone: allDone
    })
    if (allDone) {
      this.completeFollowPoem()
    } else {
      wx.showToast({ title: `+1✨ 下一句`, icon: 'none' })
      if (autoNext && followAutoMode) {
        this.setData({ followPhase: 'playing', followLineRecordPath: '' })
        setTimeout(() => this.playFollowLine(), 900)
      } else {
        this.setData({ followPhase: 'idle' })
      }
    }
  },

  completeFollowPoem() {
    const { id } = this.data
    wx.showToast({ title: '全诗跟读完成 🎉', icon: 'none' })
    api.updateProgress(id, { learned: true, read_count_delta: 1 })
      .then(() => this.completePoemTask())
      .then(task => {
        this.setData({ progressSynced: true, currentPoemLearned: true, followAutoMode: false, followWaitingRead: false, followPhase: 'done' })
        this.updateProgress()
        if (task.starsAdded > 0) {
          wx.showToast({ title: `${task.toast} +${task.starsAdded}✨`, icon: 'none', duration: 1800 })
        }
      })
      .catch(err => console.warn('同步逐句跟读完成失败', err))
  },

  markAsLearned() {
    const { id, type } = this.data

    if (type === 'poem') {
      wx.showLoading({ title: '同步中...' })
      api.updateProgress(id, { learned: true })
        .then(() => this.completePoemTask())
        .then(task => {
          wx.hideLoading()
          this.setData({ progressSynced: true, currentPoemLearned: true, followAutoMode: false, followWaitingRead: false, followPhase: 'done' })
          this.updateProgress()
          wx.showToast({
            title: task.starsAdded > 0 ? `${task.toast} +${task.starsAdded}✨` : '今天已获得过诗光啦',
            icon: 'none',
            duration: 1800
          })
        })
        .catch(err => {
          wx.hideLoading()
          console.warn('同步学习完成失败', err)
          wx.showToast({ title: '服务维护中，请稍后再试', icon: 'none' })
        })
      return
    }

    api.updateIdiomProgress({ idiom_id: id, learned: true })
      .then(() => {
        this.updateProgress()
        wx.showToast({ title: '学习完成 🎉', icon: 'success' })
      })
      .catch(err => {
        console.warn('同步成语学习进度失败', err)
        wx.showToast({ title: '服务维护中，请稍后再试', icon: 'none' })
      })
  },

  addToFavorites() {
    const { id, type, favorite } = this.data
    if (type !== 'poem') {
      this.markAsLearned()
      return
    }

    const nextFavorite = !favorite
    this.setData({ favorite: nextFavorite })

    const action = nextFavorite ? api.addFavorite(id) : api.removeFavorite(id)
    action
      .then(() => {
        wx.showToast({ title: nextFavorite ? '收藏成功 ❤️' : '已取消收藏', icon: 'none' })
      })
      .catch(err => {
        console.warn('同步收藏失败', err)
        this.setData({ favorite: !nextFavorite })
        wx.showToast({ title: '收藏同步失败', icon: 'none' })
      })
  },

  syncReadProgress() {
    const { id, type } = this.data
    if (!id) return
    if (type === 'poem') {
      api.updateProgress(id, { read_count_delta: 1 })
        .then(() => this.setData({ progressSynced: true }))
        .catch(err => console.warn('同步阅读次数失败', err))
      return
    }
    api.updateIdiomProgress({ idiom_id: id, read_count_delta: 1 })
      .then(() => this.setData({ progressSynced: true }))
      .catch(err => console.warn('同步成语阅读次数失败', err))
  },

  syncFavoriteStatus() {
    const { id, type } = this.data
    if (type !== 'poem' || !id) return

    api.listFavorites()
      .then(res => {
        const favoriteIds = (res.items || []).map(p => p.id)
        this.setData({ favorite: favoriteIds.includes(id) })
      })
      .catch(err => console.warn('获取收藏状态失败', err))
  },


  getRecorder() {
    if (!this.recorder) {
      this.recorder = wx.getRecorderManager()
      this.recorder.onStart(() => {
        this.recordStartAt = Date.now()
        this.setData({ recording: true, recorderStarted: true, recordFilePath: '', recordDuration: 0 })
      })
      this.recorder.onStop((res) => {
        const duration = res.duration ? Math.round(res.duration / 1000) : Math.max(1, Math.round((Date.now() - (this.recordStartAt || Date.now())) / 1000))
        this.setData({ recording: false, recorderStarted: false, recordFilePath: res.tempFilePath, recordDuration: duration })
        wx.showToast({ title: '录音完成，可上传', icon: 'none' })
      })
      this.recorder.onError((err) => {
        const msg = err && err.errMsg ? err.errMsg : ''
        if (msg.includes('is recording or paused')) {
          console.warn('录音已经在进行中，忽略重复开始', err)
          this.setData({ recording: true, recorderStarted: true })
          return
        }
        console.warn('录音失败', err)
        this.setData({ recording: false, recorderStarted: false })
        wx.showToast({ title: '录音失败，请检查权限', icon: 'none' })
      })
    }
    return this.recorder
  },

  startRecord() {
    if (this.data.type !== 'poem') return
    if (this.data.recording || this.data.recorderStarted) {
      wx.showToast({ title: '正在录音中', icon: 'none' })
      return
    }
    this.stopReading()
    if (this.previewAudio) {
      try { this.previewAudio.stop() } catch (e) {}
      this.setData({ previewingRecord: false })
    }
    const begin = () => {
      const recorder = this.getRecorder()
      try {
        recorder.start({
          duration: 60000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'mp3'
        })
      } catch (err) {
        console.warn('启动录音失败', err)
        this.setData({ recording: false, recorderStarted: false })
        wx.showToast({ title: '录音启动失败', icon: 'none' })
      }
    }

    ensureRecordPermission({
      title: '需要麦克风权限',
      content: '请允许麦克风权限，才能上传自己的朗诵。',
      success: begin,
      fail: () => wx.showToast({ title: '未开启麦克风权限', icon: 'none' })
    })
  },

  stopRecord() {
    if (this.recorder && (this.data.recording || this.data.recorderStarted)) {
      try {
        this.recorder.stop()
      } catch (err) {
        console.warn('停止录音失败', err)
        this.setData({ recording: false, recorderStarted: false })
      }
    }
  },



  previewMyRecitation() {
    const { recordFilePath, previewingRecord } = this.data
    if (!recordFilePath) {
      wx.showToast({ title: '请先录一段朗诵', icon: 'none' })
      return
    }

    this.stopReading()
    this.stopFollowAudio(true)
    if (this.recitationAudio) {
      try { this.recitationAudio.stop() } catch (e) {}
    }

    if (previewingRecord && this.previewAudio) {
      try { this.previewAudio.stop() } catch (e) {}
      this.setData({ previewingRecord: false })
      return
    }

    if (this.previewAudio) {
      try { this.previewAudio.destroy() } catch (e) {}
      this.previewAudio = null
    }

    this.previewAudio = audioManager.create('learn-record-preview')
    this.previewAudio.onEnded(() => this.setData({ previewingRecord: false }))
    this.previewAudio.onStop(() => this.setData({ previewingRecord: false }))
    this.previewAudio.onError((err) => {
      console.warn('试听失败', err)
      this.setData({ previewingRecord: false })
      wx.showToast({ title: '试听失败', icon: 'none' })
    })
    this.previewAudio.src = recordFilePath
    this.setData({ previewingRecord: true })
    setTimeout(() => {
      if (this.canPlayAudio() && this.data.previewingRecord && this.previewAudio) {
        audioManager.play(this.previewAudio)
      }
    }, 80)
  },

  uploadMyRecitation() {
    const { id, recordFilePath, recordDuration, uploadingRecitation } = this.data
    if (uploadingRecitation) return
    if (!recordFilePath) {
      wx.showToast({ title: '请先录一段朗诵', icon: 'none' })
      return
    }
    if (this.previewAudio) {
      try { this.previewAudio.stop() } catch (e) {}
      this.setData({ previewingRecord: false })
    }
    this.setData({ uploadingRecitation: true })
    wx.showLoading({ title: '上传中...' })
    api.uploadRecitation(id, recordFilePath, recordDuration)
      .then(() => {
        wx.hideLoading()
        this.setData({ uploadingRecitation: false, recordFilePath: '', recordDuration: 0 })
        wx.showToast({ title: '上传成功 🎉', icon: 'none' })
        this.loadRecitations()
        this.loadFeaturedRecitation()
      })
      .catch(err => {
        wx.hideLoading()
        console.warn('上传朗诵失败', err)
        this.setData({ uploadingRecitation: false })
        wx.showToast({ title: err.message || '上传失败', icon: 'none' })
      })
  },


  loadFeaturedRecitation() {
    const { id, type } = this.data
    if (type !== 'poem' || !id) return
    api.getFeaturedRecitation(id)
      .then(res => this.setData({ featuredRecitation: res.item || null }))
      .catch(err => console.warn('读取人气朗诵失败', err))
  },

  playFeaturedRecitation() {
    const item = this.data.featuredRecitation
    if (!item || !item.id) return
    this.playRecitation({ currentTarget: { dataset: { id: item.id } } })
  },

  loadRecitations() {
    const { id, type } = this.data
    if (type !== 'poem' || !id) return
    api.listRecitationsTop(id, 5)
      .then(res => this.setData({ recitations: res.items || [] }))
      .catch(err => console.warn('读取朗诵榜失败', err))
  },

  async playRecitation(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    const url = `${api.config.apiBaseUrl}/recitations/${id}/audio`
    this.stopReading()
    if (this.data.playingRecitationId === id && this.recitationAudio) {
      try { this.recitationAudio.stop() } catch (e) {}
      this.setData({ playingFeatured: false })
      return
    }
    this.stopFollowAudio(true)
    if (this.recitationAudio) {
      try { this.recitationAudio.destroy() } catch (e) {}
      this.recitationAudio = null
    }

    let audioPath = url
    wx.showLoading({ title: '加载音频...' })
    try {
      audioPath = await audioCache.downloadAndCache(url, { tag: 'recitation-audio' })
    } catch (err) {
      console.warn('朗诵音频缓存失败，尝试直接播放远程 URL', err, url)
      audioPath = url
    }
    wx.hideLoading()
    if (this.data.playingRecitationId && this.data.playingRecitationId !== id) return

    this.recitationAudio = audioManager.create('learn-recitation')
    this.recitationAudio.onEnded(() => this.setData({ playingRecitationId: '', playingFeatured: false }))
    this.recitationAudio.onStop(() => this.setData({ playingRecitationId: '', playingFeatured: false }))
    this.recitationAudio.onError((err) => {
      console.warn('朗诵播放失败', err)
      this.setData({ playingRecitationId: '', playingFeatured: false })
      wx.showToast({ title: '播放失败', icon: 'none' })
    })
    this.recitationAudio.src = audioPath
    this.setData({
      playingRecitationId: id,
      playingFeatured: !!(this.data.featuredRecitation && this.data.featuredRecitation.id === id)
    })
    setTimeout(() => {
      if (this.canPlayAudio() && this.data.playingRecitationId === id && this.recitationAudio) {
        audioManager.playWithRetry(this.recitationAudio, {
          attempts: 4,
          delay: 260,
          shouldContinue: () => this.canPlayAudio() && this.data.playingRecitationId === id && !!this.recitationAudio
        })
      }
    }, 120)
  },

  toggleRecitationLike(e) {
    const { id, liked } = e.currentTarget.dataset
    const action = liked ? api.unlikeRecitation(id) : api.likeRecitation(id)
    action
      .then(() => {
        this.loadRecitations()
        this.loadFeaturedRecitation()
      })
      .catch(err => {
        console.warn('点赞失败', err)
        wx.showToast({ title: '操作失败', icon: 'none' })
      })
  },

  goBack() {
    this.pageActive = false
    this.cleanupFollowSession()
    this.stopReading({ recreate: false })
    audioManager.destroyAll()
    wx.navigateBack()
  },

  onResize() {
    this.updateViewportMode()
  },

  onHide() {
    this.pageActive = false
    this.cleanupFollowSession()
    this.stopReading({ recreate: false })
    if (this.recorder && (this.data.recording || this.data.recorderStarted)) {
      try { this.recorder.stop() } catch (e) {}
    }
    this.setData({ landscapeFollowVisible: false })
    audioManager.stopAll()
    if (wx.setPageOrientation) {
      wx.setPageOrientation({ orientation: 'portrait', fail: () => {} })
    }
  },

  onUnload() {
    this.pageActive = false
    if (wx.setPageOrientation) {
      wx.setPageOrientation({ orientation: 'portrait', fail: () => {} })
    }
    this.stopReading({ recreate: false })
    this.cleanupFollowSession()
    if (this.audio) {
      try { this.audio.destroy() } catch (e) {}
      this.audio = null
    }
    if (this.recitationAudio) {
      try { this.recitationAudio.destroy() } catch (e) {}
      this.recitationAudio = null
    }
    if (this.previewAudio) {
      try { this.previewAudio.destroy() } catch (e) {}
      this.previewAudio = null
    }
    audioManager.destroyAll()
  }
})
