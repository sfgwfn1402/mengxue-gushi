// pages/voice-agreement/voice-agreement.js
const voiceConsent = require('../../utils/voice-consent')

Page({
  data: {
    agreed: false
  },

  onShow() {
    this.setData({ agreed: voiceConsent.hasConsent() })
  },

  agreeAndBack() {
    voiceConsent.setConsent()
    wx.showToast({ title: '已同意', icon: 'success' })
    setTimeout(() => {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.reLaunch({ url: '/pages/index/index' })
      }
    }, 600)
  },

  revoke() {
    voiceConsent.clearConsent()
    this.setData({ agreed: false })
    wx.showToast({ title: '已撤回授权', icon: 'none' })
  }
})
