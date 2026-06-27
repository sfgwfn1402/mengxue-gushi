// pages/listen/listen.js - 磨耳朵·古诗听单
// 用 BackgroundAudioManager 实现后台/锁屏连续播放；睡前定时用 onTimeUpdate 比对时间戳，后台也可靠。
const app = getApp()
const api = require('../../utils/api')
const { getRemotePoemAudioPath, getPoemImageUrl, isPoemAudioPending } = require('../../utils/tts')
const { track } = require('../../utils/track')

function fmt(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r < 10 ? '0' : ''}${r}`
}

const SLEEP_OPTIONS = [
  { min: 0, label: '不开' },
  { min: 15, label: '15分钟' },
  { min: 30, label: '30分钟' },
  { min: 60, label: '60分钟' }
]

Page({
  data: {
    lists: [
      { key: 'all', label: '全部' },
      { key: 'learned', label: '已学过' },
      { key: 'level1', label: '启蒙必背' },
      { key: 'level2', label: '进阶诗' }
    ],
    activeList: 'all',
    playlist: [],
    index: 0,
    current: null,
    playing: false,
    loopOne: false,
    sleepOptions: SLEEP_OPTIONS,
    sleepLabel: '不开',
    progress: 0,
    curTime: '0:00',
    durTime: '0:00',
    empty: false
  },

  onLoad() {
    this._sleepUntil = 0
    this.ensurePoems().then(() => {
      this.loadProgressThenBuild()
    })
    this.bindBam()
  },

  onShow() {
    // 回到页面时同步播放状态（BAM 是全局单例，可能在后台一直在放）
    const bam = wx.getBackgroundAudioManager()
    this.setData({ playing: !bam.paused && !!bam.src })
  },

  ensurePoems() {
    const poems = (app.getPoems && app.getPoems()) || []
    if (poems.length) return Promise.resolve(poems)
    return api.listAllPoems()
      .then(res => {
        const items = res.items || []
        if (app.globalData) app.globalData.poems = items
        return items
      })
      .catch(() => [])
  },

  loadProgressThenBuild() {
    api.listProgress()
      .then(items => {
        const list = Array.isArray(items) ? items : (items.items || [])
        this._learnedIds = new Set(
          list.filter(it => it.learned).map(it => Number(it.poem_id != null ? it.poem_id : it.poemId))
        )
        this.buildPlaylist(this.data.activeList, { autoplay: false })
      })
      .catch(() => {
        this._learnedIds = new Set()
        this.buildPlaylist(this.data.activeList, { autoplay: false })
      })
  },

  buildPlaylist(key, opts) {
    const poems = (app.getPoems && app.getPoems()) || []
    let pool = poems.filter(p => !isPoemAudioPending(p) && getRemotePoemAudioPath(p))
    if (key === 'learned') {
      const ids = this._learnedIds || new Set()
      pool = pool.filter(p => ids.has(Number(p.id)))
    } else if (key === 'level1') {
      pool = pool.filter(p => Number(p.level || p.difficulty) === 1)
    } else if (key === 'level2') {
      pool = pool.filter(p => Number(p.level || p.difficulty) === 2)
    }
    const playlist = pool.map(p => ({
      id: p.id,
      title: p.title,
      author: p.author || '',
      dynasty: p.dynasty || '',
      cover: getPoemImageUrl(p.id),
      url: getRemotePoemAudioPath(p)
    }))
    this.setData({
      playlist,
      activeList: key,
      empty: playlist.length === 0,
      index: 0,
      current: playlist[0] || null
    })
    if (opts && opts.autoplay && playlist.length) {
      this.playAt(0)
    }
  },

  switchList(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeList) return
    const wasPlaying = this.data.playing
    this.buildPlaylist(key, { autoplay: wasPlaying })
  },

  bindBam() {
    const bam = wx.getBackgroundAudioManager()
    bam.onPlay(() => this.setData({ playing: true }))
    bam.onPause(() => this.setData({ playing: false }))
    bam.onStop(() => this.setData({ playing: false }))
    bam.onEnded(() => {
      if (this.data.loopOne) {
        this.playAt(this.data.index)
      } else {
        this.next()
      }
    })
    bam.onError(() => {
      // 当前音频异常，跳下一首，避免卡住
      this.next()
    })
    bam.onNext(() => this.next())
    bam.onPrev(() => this.prev())
    bam.onTimeUpdate(() => {
      const dur = bam.duration || 0
      const cur = bam.currentTime || 0
      this.setData({
        progress: dur ? Math.min(100, cur / dur * 100) : 0,
        curTime: fmt(cur),
        durTime: fmt(dur)
      })
      // 睡前定时：到点即停（后台也能触发，因为播放中 timeUpdate 持续回调）
      if (this._sleepUntil && Date.now() >= this._sleepUntil) {
        this._sleepUntil = 0
        this.setData({ sleepLabel: '不开' })
        bam.stop()
        wx.showToast({ title: '定时已到，停止播放', icon: 'none' })
      }
    })
    this.bam = bam
  },

  playAt(i) {
    const item = this.data.playlist[i]
    if (!item) return
    const bam = this.bam || wx.getBackgroundAudioManager()
    bam.title = `《${item.title}》`
    bam.epname = '萌学古诗·磨耳朵'
    bam.singer = `${item.dynasty}${item.author ? ' · ' + item.author : ''}`
    if (item.cover) bam.coverImgUrl = item.cover
    bam.src = item.url // 设置 src 自动播放
    this.setData({ index: i, current: item, playing: true, progress: 0, curTime: '0:00' })
    track('listen_play', { poem_id: item.id, list: this.data.activeList })
  },

  togglePlay() {
    const bam = this.bam || wx.getBackgroundAudioManager()
    if (!this.data.current) {
      if (this.data.playlist.length) this.playAt(0)
      return
    }
    if (bam.paused) {
      bam.play()
    } else {
      bam.pause()
    }
  },

  next() {
    const len = this.data.playlist.length
    if (!len) return
    const i = (this.data.index + 1) % len
    this.playAt(i)
  },

  prev() {
    const len = this.data.playlist.length
    if (!len) return
    const i = (this.data.index - 1 + len) % len
    this.playAt(i)
  },

  tapTrack(e) {
    const i = e.currentTarget.dataset.index
    this.playAt(i)
  },

  toggleLoopOne() {
    this.setData({ loopOne: !this.data.loopOne })
  },

  setSleep(e) {
    const min = Number(e.currentTarget.dataset.min)
    if (!min) {
      this._sleepUntil = 0
      this.setData({ sleepLabel: '不开' })
      return
    }
    this._sleepUntil = Date.now() + min * 60000
    const opt = SLEEP_OPTIONS.find(o => o.min === min)
    this.setData({ sleepLabel: opt ? opt.label : `${min}分钟` })
    wx.showToast({ title: `${min}分钟后自动停`, icon: 'none' })
  }
})
