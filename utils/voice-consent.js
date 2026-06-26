// 录音（声纹）授权同意：微信审核要求收集用户声纹前，需独立《声纹授权协议》并明确取得同意。
// 录音前统一调用 ensureVoiceConsent()，未同意不得录音。
const CONSENT_KEY = 'voiceConsentAgreed'

function hasConsent() {
  return !!wx.getStorageSync(CONSENT_KEY)
}

function setConsent() {
  try {
    wx.setStorageSync(CONSENT_KEY, true)
  } catch (e) {}
}

function clearConsent() {
  try {
    wx.removeStorageSync(CONSENT_KEY)
  } catch (e) {}
}

// 返回 Promise：已同意/本次同意 -> resolve；拒绝或去看协议 -> reject（不录音）。
function ensureVoiceConsent() {
  return new Promise((resolve, reject) => {
    if (hasConsent()) {
      resolve()
      return
    }
    wx.showModal({
      title: '录音授权',
      content:
        '为生成朗诵作品、逐句跟读和 AI 朗诵评分，需要录制并上传孩子的朗诵声音（声纹/语音信息）。点击“同意”表示你已阅读并同意《声纹授权协议》。',
      confirmText: '同意',
      cancelText: '查看协议',
      success(res) {
        if (res.confirm) {
          setConsent()
          resolve()
        } else {
          // 去看完整协议，看完在协议页同意；本次先不录音
          wx.navigateTo({ url: '/pages/voice-agreement/voice-agreement' })
          reject(new Error('view-agreement'))
        }
      },
      fail() {
        reject(new Error('consent-failed'))
      }
    })
  })
}

module.exports = {
  ensureVoiceConsent,
  hasConsent,
  setConsent,
  clearConsent
}
