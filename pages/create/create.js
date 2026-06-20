const app = getApp()
const api = require('../../utils/api')
const { ensureRecordPermission } = require('../../utils/record-permission')

Page({
  data: {
    mode: 'recitation',
    poems: [],
    filteredPoems: [],
    defaultPoems: [],
    poemSearch: '',
    poemListHint: '最近学过',
    defaultPoemListHint: '最近学过',
    poemIndex: 0,
    selectedPoem: null,
    selectedPoemId: 0,
    selectedPoemTitle: '请选择古诗',
    recording: false,
    recordFilePath: '',
    recordDuration: 0,
    artworkPath: '',
    artworkTitle: '',
    artworkDesc: '',
    publishing: false,
    myArtworks: []
  },

  onLoad() {
    this.loadPoems()
    this.loadMyArtworks()
  },

  onShow() {
    this.loadMyArtworks()
  },

  loadPoems() {
    const localPoems = (app.getPoems && app.getPoems()) || []
    if (localPoems.length) {
      this.setPoems(localPoems)
      return
    }
    api.listPoems({ page: 1, page_size: 100 })
      .then(res => this.setPoems(res.items || []))
      .catch(err => console.warn('读取古诗失败', err))
  },

  setPoems(poems) {
    api.listProgress()
      .catch(() => [])
      .then(progressItems => {
        const recentPoems = this.pickRecentPoems(poems, progressItems)
        const initialPoems = recentPoems.length ? recentPoems : poems.slice(0, 12)
        const poemListHint = recentPoems.length ? '最近学过' : '推荐古诗'
        const selectedPoem = initialPoems[0] || poems[0] || null
        this.setData({
          poems,
          filteredPoems: initialPoems,
          defaultPoems: initialPoems,
          poemListHint,
          defaultPoemListHint: poemListHint,
          selectedPoem,
          selectedPoemId: selectedPoem ? selectedPoem.id : 0,
          selectedPoemTitle: this.formatPoemTitle(selectedPoem)
        })
      })
  },

  pickRecentPoems(poems, progressItems) {
    const poemMap = {}
    poems.forEach(poem => { poemMap[Number(poem.id)] = poem })
    return (progressItems || [])
      .filter(item => item.last_learned_at && poemMap[Number(item.poem_id || item.poemId)])
      .sort((a, b) => String(b.last_learned_at).localeCompare(String(a.last_learned_at)))
      .map(item => poemMap[Number(item.poem_id || item.poemId)])
      .slice(0, 12)
  },

  formatPoemTitle(poem) {
    return poem ? `《${poem.title}》 ${poem.author || ''}` : '请选择古诗'
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode })
  },

  onPoemChange(e) {
    const poemIndex = Number(e.detail.value || 0)
    const selectedPoem = this.data.poems[poemIndex] || null
    this.setData({ poemIndex, selectedPoem, selectedPoemId: selectedPoem ? selectedPoem.id : 0, selectedPoemTitle: this.formatPoemTitle(selectedPoem) })
  },

  onPoemSearchInput(e) {
    const poemSearch = e.detail.value || ''
    const keyword = poemSearch.trim().toLowerCase()
    const filteredPoems = keyword
      ? this.data.poems.filter(poem => this.matchPoem(poem, keyword)).slice(0, 20)
      : this.data.defaultPoems
    this.setData({ poemSearch, filteredPoems, poemListHint: keyword ? '搜索结果' : this.data.defaultPoemListHint })
  },

  matchPoem(poem, keyword) {
    const text = [poem.title, poem.author, poem.dynasty, poem.content, (poem.tags || []).join(' ')]
      .join(' ')
      .toLowerCase()
    return text.includes(keyword)
  },

  selectPoem(e) {
    const id = Number(e.currentTarget.dataset.id)
    const selectedPoem = this.data.poems.find(poem => Number(poem.id) === id) || null
    const poemIndex = this.data.poems.findIndex(poem => Number(poem.id) === id)
    if (!selectedPoem) return
    this.setData({
      selectedPoem,
      selectedPoemId: selectedPoem.id,
      poemIndex: poemIndex >= 0 ? poemIndex : 0,
      selectedPoemTitle: this.formatPoemTitle(selectedPoem),
      poemSearch: '',
      filteredPoems: [selectedPoem].concat(this.data.poems.filter(poem => Number(poem.id) !== id).slice(0, 11))
    })
  },

  getRecorder() {
    if (!this.recorder) {
      this.recorder = wx.getRecorderManager()
      this.recorder.onStop(res => {
        this.setData({
          recording: false,
          recordFilePath: res.tempFilePath,
          recordDuration: Math.max(1, Math.round((res.duration || 0) / 1000))
        })
      })
      this.recorder.onError(err => {
        console.warn('录音失败', err)
        this.setData({ recording: false })
        wx.showToast({ title: '录音失败', icon: 'none' })
      })
    }
    return this.recorder
  },

  startRecord() {
    if (!this.data.selectedPoem) {
      wx.showToast({ title: '请先选择古诗', icon: 'none' })
      return
    }
    ensureRecordPermission({
      title: '需要麦克风权限',
      content: '请允许麦克风权限，才能录制自己的朗诵。',
      success: () => {
        try {
          this.getRecorder().start({ duration: 90000, format: 'mp3' })
          this.setData({ recording: true, recordFilePath: '', recordDuration: 0 })
        } catch (err) {
          console.warn('启动录音失败', err)
          this.setData({ recording: false })
          wx.showToast({ title: '录音启动失败', icon: 'none' })
        }
      },
      fail: () => wx.showToast({ title: '未开启麦克风权限', icon: 'none' })
    })
  },

  stopRecord() {
    if (this.data.recording) this.getRecorder().stop()
  },

  chooseArtwork() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = res.tempFiles && res.tempFiles[0]
        if (file && file.tempFilePath) this.setData({ artworkPath: file.tempFilePath })
      }
    })
  },

  onTitleInput(e) {
    this.setData({ artworkTitle: e.detail.value || '' })
  },

  onDescInput(e) {
    this.setData({ artworkDesc: e.detail.value || '' })
  },

  publishRecitation() {
    const poem = this.data.selectedPoem
    if (!poem) return wx.showToast({ title: '请先选择古诗', icon: 'none' })
    if (!this.data.recordFilePath) return wx.showToast({ title: '请先录一段朗诵', icon: 'none' })

    this.setData({ publishing: true })
    api.uploadRecitation(poem.id, this.data.recordFilePath, this.data.recordDuration)
      .then(() => {
        this.setData({ publishing: false, recordFilePath: '', recordDuration: 0 })
        wx.showToast({ title: '已保存到我的作品', icon: 'success' })
      })
      .catch(err => {
        console.warn('发布朗诵失败', err)
        this.setData({ publishing: false })
        wx.showToast({ title: '发布失败', icon: 'none' })
      })
  },

  publishArtwork() {
    const poem = this.data.selectedPoem
    const title = (this.data.artworkTitle || '').trim() || '我的诗配画'
    if (!poem) return wx.showToast({ title: '请先选择古诗', icon: 'none' })
    if (!this.data.artworkPath) return wx.showToast({ title: '请先选择图片', icon: 'none' })

    this.setData({ publishing: true })
    api.uploadArtwork(poem.id, this.data.artworkPath, {
      title,
      description: this.data.artworkDesc
    })
      .then(() => {
        this.setData({ publishing: false, artworkPath: '', artworkTitle: '', artworkDesc: '' })
        wx.showToast({ title: '已保存到我的作品', icon: 'success' })
        this.loadMyArtworks()
      })
      .catch(err => {
        console.warn('发布诗配画失败', err)
        this.setData({ publishing: false })
        wx.showToast({ title: '发布失败', icon: 'none' })
      })
  },

  loadMyArtworks() {
    api.listArtworks({ mine: true, limit: 6 })
      .then(res => this.setData({ myArtworks: res.items || [] }))
      .catch(err => console.warn('读取我的诗配画失败', err))
  }
})
