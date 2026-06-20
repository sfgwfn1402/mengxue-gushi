const TYPE_LABELS = {
  content: '内容建议',
  fun: '快乐学习',
  audio: '朗读音频',
  image: '插画动画',
  practice: '练习背诵',
  bug: '问题反馈'
}

Page({
  data: {
    ages: ['3-4岁', '5-6岁', '一年级', '二年级', '三年级+', '家长自学'],
    types: [
      { value: 'content', label: '内容建议' },
      { value: 'fun', label: '快乐学习' },
      { value: 'audio', label: '朗读音频' },
      { value: 'image', label: '插画动画' },
      { value: 'practice', label: '练习背诵' },
      { value: 'bug', label: '问题反馈' }
    ],
    age: '',
    type: 'fun',
    painPoint: '',
    suggestion: '',
    contact: '',
    history: []
  },

  onLoad() {
    this.loadHistory()
  },

  loadHistory() {
    const history = wx.getStorageSync('parentFeedbackHistory') || []
    this.setData({ history: history.slice(0, 5) })
  },

  selectAge(e) {
    this.setData({ age: e.currentTarget.dataset.value })
  },

  selectType(e) {
    this.setData({ type: e.currentTarget.dataset.value })
  },

  onPainInput(e) {
    this.setData({ painPoint: e.detail.value })
  },

  onSuggestionInput(e) {
    this.setData({ suggestion: e.detail.value })
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value })
  },

  submitFeedback() {
    const { age, type, painPoint, suggestion, contact } = this.data
    if (!painPoint.trim() && !suggestion.trim()) {
      wx.showToast({ title: '先写一点想法吧', icon: 'none' })
      return
    }

    const item = {
      age,
      type,
      typeLabel: TYPE_LABELS[type] || '反馈',
      painPoint: painPoint.trim(),
      suggestion: suggestion.trim(),
      contact: contact.trim(),
      createdAt: new Date().toISOString()
    }
    const history = [item].concat(wx.getStorageSync('parentFeedbackHistory') || []).slice(0, 20)
    wx.setStorageSync('parentFeedbackHistory', history)

    const summary = [
      '【萌学古诗家长心声】',
      `孩子年龄：${item.age || '未填写'}`,
      `反馈类型：${item.typeLabel}`,
      `学习困难：${item.painPoint || '未填写'}`,
      `改进建议：${item.suggestion || '未填写'}`,
      `联系方式：${item.contact || '未填写'}`
    ].join('\n')

    wx.setClipboardData({
      data: summary,
      success: () => {
        wx.showModal({
          title: '谢谢你的心声',
          content: '反馈已保存在本机，并复制到剪贴板。你可以直接发给我们，后续版本会接入在线提交。',
          showCancel: false
        })
      }
    })

    this.setData({ painPoint: '', suggestion: '', contact: '', history: history.slice(0, 5) })
  }
})
