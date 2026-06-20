// pages/animation/animation.js
const app = getApp()

Page({
  data: {
    poem: null,
    currentScene: '',
    poemId: 1,
    totalPoems: 0,
    hasVideo: false,
    videoSrc: '',
    autoplay: true,
    sceneLines: []
  },

  onLoad(options) {
    const { id } = options
    const poemId = parseInt(id) || 1
    this.loadPoem(poemId)
  },

  loadPoem(id) {
    const poems = (app.getPoems && app.getPoems()) || app.globalData.poems || []
    const poem = poems.find(p => p.id === id) || poems[0]
    if (!poem) {
      wx.showToast({ title: '未找到古诗', icon: 'none' })
      return
    }

    const sceneLines = this.splitPoemLines(poem.content)
    this.setData({ 
      poem,
      poemId: poem.id,
      totalPoems: poems.length,
      currentScene: 'scene-' + poem.id,
      hasVideo: false,
      videoSrc: '',
      autoplay: true,
      sceneLines
    })
    wx.setNavigationBarTitle({ title: poem.title + ' - 动画' })
  },

  splitPoemLines(content) {
    return (content || '')
      .replace(/([，。！？；])/g, '$1|')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 8)
  },

  replayVideo() {
    const { poemId } = this.data
    this.setData({ isReplaying: true })
    setTimeout(() => this.setData({ isReplaying: false }), 500)

    this.setData({ currentScene: '' })
    setTimeout(() => {
      this.setData({ currentScene: 'scene-' + poemId })
    }, 100)
  },

  prevPoem() {
    const poems = (app.getPoems && app.getPoems()) || app.globalData.poems || []
    const index = poems.findIndex(p => p.id === this.data.poemId)
    if (index > 0) this.loadPoem(poems[index - 1].id)
  },

  nextPoem() {
    const poems = (app.getPoems && app.getPoems()) || app.globalData.poems || []
    const index = poems.findIndex(p => p.id === this.data.poemId)
    if (index >= 0 && index < poems.length - 1) this.loadPoem(poems[index + 1].id)
  },

  goBack() {
    // 避免开发工具在 animation 页面触发 routeDone 空路径错误；这里不再调用任何路由 API。
    wx.showToast({ title: '请使用左上角返回或底部导航', icon: 'none' })
  }
})
