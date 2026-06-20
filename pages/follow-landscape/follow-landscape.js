const app = getApp()
const api = require('../../utils/api')
const { getAudioCandidates, pickAvailableAudio } = require('../../utils/tts')
const audioManager = require('../../utils/audio-manager')
const lineTimings = require('../../data/poem-line-timings')
const { ensureRecordPermission } = require('../../utils/record-permission')

const fallbackPoems = [
  { id: 1, title: '静夜思', author: '李白', dynasty: '唐', content: '床前明月光，疑是地上霜。举头望明月，低头思故乡。', audio: '/audios/poem-1.mp3' },
  { id: 2, title: '春晓', author: '孟浩然', dynasty: '唐', content: '春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。', audio: '/audios/poem-2.mp3' },
  { id: 3, title: '登鹳雀楼', author: '王之涣', dynasty: '唐', content: '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。', audio: '/audios/poem-3.mp3' }
]

Page({
  data: {
    id: null,
    poem: {},
    poemLines: [],
    followLineTimings: [],
    followLineIndex: 0,
    followLineDone: [],
    followCompletedCount: 0,
    followPhase: 'idle',
    followRecording: false,
    followRecorderStarted: false,
    followLineRecordPath: '',
    mainButtonText: '开始跟读',
    audioPath: '',
    lineDurationMs: 2600
  },

  onLoad(options) {
    this.pageActive = true
    const id = Number(options.id || 0)
    this.setData({ id })
    this.loadPoem(id)
  },

  onShow() {
    this.pageActive = true
  },

  onHide() {
    this.pageActive = false
    this.cleanup()
    audioManager.stopAll()
  },

  onUnload() {
    this.pageActive = false
    this.cleanup()
    audioManager.destroyAll()
  },

  loadPoem(id) {
    const appPoems = app && app.getPoems ? app.getPoems() : (app && app.globalData && app.globalData.poems ? app.globalData.poems : [])
    const poems = appPoems && appPoems.length ? appPoems : fallbackPoems
    const poem = poems.find(p => Number(p.id) === id)
    if (!poem) {
      wx.showToast({ title: '未找到古诗', icon: 'none' })
      return
    }
    const poemLines = this.getFollowLines(poem, this.splitPoemLines(poem.content))
    const followLineTimings = this.getFollowLineTimings(poem, poemLines)
    this.setData({
      poem,
      poemLines,
      followLineTimings,
      followLineIndex: 0,
      followLineDone: poemLines.map(() => false),
      followCompletedCount: 0,
      followPhase: 'idle',
      mainButtonText: '开始跟读'
    })
    this.prepareAudio(poem)
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

  getFollowLines(poem, poemLines) {
    if (Number(poem && poem.id) === 9) {
      return ['鹅，鹅，鹅，', '曲项向天歌。', '白毛浮绿水，', '红掌拨清波。']
    }
    return poemLines
  },

  getFollowLineTimings(poem, followLines) {
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
    const item = lineTimings[String(poem && poem.id)]
    const timingLines = item && item.lines ? item.lines : []
    return followLines.map((line, index) => Object.assign({ index, text: line }, timingLines[index] || {}))
  },

  async prepareAudio(poem) {
    const candidates = getAudioCandidates('poem', poem)
    const audioPath = await pickAvailableAudio(candidates)
    if (audioPath) this.setData({ audioPath })
  },

  updateMainText() {
    const phase = this.data.followPhase
    const textMap = {
      idle: '开始跟读',
      playing: '播放中…点我读',
      recording: '完成录音',
      preview: '回放中…',
      done: '再练一次'
    }
    this.setData({ mainButtonText: textMap[phase] || '开始跟读' })
  },

  handleMainAction() {
    const { followPhase, followRecording, followRecorderStarted } = this.data
    if (followPhase === 'recording' || followRecording || followRecorderStarted) {
      this.stopRecord()
      return
    }
    if (followPhase === 'playing') {
      this.stopLineAudio()
      this.beginRecordingPrompt()
      return
    }
    if (followPhase === 'preview') return
    if (followPhase === 'done') {
      this.setData({
        followLineIndex: 0,
        followLineDone: this.data.poemLines.map(() => false),
        followCompletedCount: 0,
        followPhase: 'idle',
        followLineRecordPath: ''
      })
    }
    this.playCurrentLine()
  },

  replayLine() {
    if (!this.data.poemLines.length) return
    this.playCurrentLine()
  },

  skipToNext() {
    this.completeLine(false)
  },

  selectLine(e) {
    const index = Number(e.currentTarget.dataset.index || 0)
    if (index < 0 || index >= this.data.poemLines.length) return
    this.cleanupLineOnly()
    this.setData({ followLineIndex: index, followPhase: 'idle', mainButtonText: '开始跟读' })
  },

  createAudio() {
    this.stopLineAudio()
    const audio = audioManager.create('follow-landscape-line')
    audio.onEnded(() => { if (this.pageActive) this.beginRecordingPrompt() })
    audio.onError((err) => {
      console.warn('横屏跟读播放失败', err)
      this.beginRecordingPrompt()
    })
    this.lineAudio = audio
    return audio
  },

  playCurrentLine() {
    const { audioPath, poemLines, followLineIndex } = this.data
    if (!poemLines.length) return
    if (!audioPath) {
      wx.showToast({ title: '音频还在加载，稍后再试', icon: 'none' })
      this.prepareAudio(this.data.poem)
      return
    }

    this.cleanupLineOnly()
    this.setData({ followPhase: 'playing' }, () => this.updateMainText())

    const audio = this.createAudio()
    const timingLine = this.data.followLineTimings && this.data.followLineTimings.length ? this.data.followLineTimings[followLineIndex] : null
    if (timingLine && typeof timingLine.start === 'number') {
      audio.startTime = Math.max(0, Number(timingLine.start || 0))
    }
    audio.src = audioPath

    const durationMs = timingLine && typeof timingLine.start === 'number' && typeof timingLine.end === 'number'
      ? Math.max(1200, Math.round((Number(timingLine.end) - Number(timingLine.start)) * 1000))
      : Math.max(2200, Math.min(4200, Math.round(1500 + String(poemLines[followLineIndex] || '').length * 180)))
    this.setData({ lineDurationMs: durationMs })

    try { audio.play() } catch (e) { this.beginRecordingPrompt() }

    this.lineTimer = setTimeout(() => {
      if (this.data.followPhase === 'playing') {
        this.stopLineAudio()
        this.beginRecordingPrompt()
      }
    }, durationMs)
  },

  beginRecordingPrompt() {
    if (!this.pageActive) return
    this.stopLineAudio()
    this.setData({ followPhase: 'recording' }, () => this.updateMainText())
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    setTimeout(() => {
      if (this.data.followPhase === 'recording' && !this.data.followRecorderStarted) this.startRecord()
    }, 350)
  },

  getRecorder() {
    if (!this.recorder) {
      this.recorder = wx.getRecorderManager()
      this.recorder.onStart(() => {
        this.recordStartAt = Date.now()
        this.setData({ followRecording: true, followRecorderStarted: true, followPhase: 'recording' }, () => this.updateMainText())
      })
      this.recorder.onStop((res) => {
        this.setData({
          followRecording: false,
          followRecorderStarted: false,
          followPhase: 'preview',
          followLineRecordPath: res.tempFilePath || ''
        }, () => this.updateMainText())
        setTimeout(() => this.previewRecord(), 250)
      })
      this.recorder.onError((err) => {
        console.warn('横屏跟读录音失败', err)
        this.setData({ followRecording: false, followRecorderStarted: false, followPhase: 'idle' }, () => this.updateMainText())
        wx.showToast({ title: '录音失败，请检查权限', icon: 'none' })
      })
    }
    return this.recorder
  },

  startRecord() {
    const begin = () => {
      try {
        this.getRecorder().start({
          duration: 15000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'mp3'
        })
      } catch (err) {
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

  stopRecord() {
    if (this.recorder && (this.data.followRecording || this.data.followRecorderStarted)) {
      try { this.recorder.stop() } catch (err) { console.warn('停止录音失败', err) }
    }
  },

  previewRecord() {
    const path = this.data.followLineRecordPath
    if (!path) {
      this.completeLine(true)
      return
    }
    if (this.previewAudio) {
      try { this.previewAudio.destroy() } catch (e) {}
      this.previewAudio = null
    }
    const audio = audioManager.create('follow-landscape-preview')
    audio.onEnded(() => { if (this.pageActive) this.completeLine(true) })
    audio.onStop(() => {})
    audio.onError(() => { if (this.pageActive) this.completeLine(true) })
    audio.src = path
    this.previewAudio = audio
    audio.play()
  },

  completeLine(autoNext) {
    if (!this.pageActive) return
    const { followLineIndex, followLineDone, poemLines } = this.data
    if (!poemLines.length) return
    this.cleanupLineOnly()
    const done = followLineDone.slice()
    if (!done[followLineIndex]) done[followLineIndex] = true
    const completed = done.filter(Boolean).length
    const allDone = completed >= poemLines.length
    const nextIndex = allDone ? followLineIndex : Math.min(poemLines.length - 1, followLineIndex + 1)
    this.setData({
      followLineDone: done,
      followCompletedCount: completed,
      followLineIndex: nextIndex,
      followPhase: allDone ? 'done' : 'idle',
      followLineRecordPath: ''
    }, () => this.updateMainText())

    if (allDone) {
      this.completePoem()
    } else if (autoNext) {
      setTimeout(() => this.playCurrentLine(), 700)
    }
  },

  completePoem() {
    const id = this.data.id
    wx.showToast({ title: '全诗跟读完成 🎉', icon: 'none' })
    api.updateProgress(id, { learned: true, read_count_delta: 1 })
      .then(() => api.completeTask('learn1', 3))
      .catch(err => console.warn('横屏跟读完成同步失败', err))
  },

  stopLineAudio() {
    if (this.lineTimer) {
      clearTimeout(this.lineTimer)
      this.lineTimer = null
    }
    if (this.lineAudio) {
      try { this.lineAudio.stop() } catch (e) {}
      try { this.lineAudio.destroy() } catch (e) {}
      this.lineAudio = null
    }
  },

  cleanupLineOnly() {
    this.stopLineAudio()
    if (this.previewAudio) {
      try { this.previewAudio.stop() } catch (e) {}
      try { this.previewAudio.destroy() } catch (e) {}
      this.previewAudio = null
    }
    if (this.recorder && (this.data.followRecording || this.data.followRecorderStarted)) {
      try { this.recorder.stop() } catch (e) {}
    }
  },

  cleanup() {
    this.cleanupLineOnly()
  },

  exitLandscape() {
    this.pageActive = false
    this.cleanup()
    audioManager.destroyAll()
    wx.redirectTo({
      url: `/pages/learn/learn?id=${this.data.id}&type=poem`
    })
  }
})
