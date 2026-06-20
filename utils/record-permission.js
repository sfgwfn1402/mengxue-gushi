function openRecordSetting(onGranted, onDenied) {
  if (!wx.openSetting) {
    if (onDenied) onDenied()
    return
  }
  wx.openSetting({
    success(res) {
      const granted = !!(res.authSetting && res.authSetting['scope.record'])
      if (granted) {
        onGranted && onGranted()
      } else {
        onDenied && onDenied()
      }
    },
    fail() {
      onDenied && onDenied()
    }
  })
}

function ensureRecordPermission(options) {
  const opts = options || {}
  const onGranted = opts.success || function () {}
  const onDenied = opts.fail || function () {}
  const modalTitle = opts.title || '需要麦克风权限'
  const modalContent = opts.content || '请允许麦克风权限后再录音。'

  const showPermissionModal = () => {
    wx.showModal({
      title: modalTitle,
      content: modalContent,
      confirmText: '去设置',
      success(res) {
        if (res.confirm) {
          openRecordSetting(onGranted, onDenied)
        } else {
          onDenied()
        }
      },
      fail() {
        onDenied()
      }
    })
  }

  if (wx.getSetting) {
    wx.getSetting({
      success(res) {
        const authSetting = res.authSetting || {}
        if (authSetting['scope.record']) {
          onGranted()
          return
        }
        if (authSetting['scope.record'] === false) {
          showPermissionModal()
          return
        }
        if (wx.authorize) {
          wx.authorize({
            scope: 'scope.record',
            success: onGranted,
            fail: showPermissionModal
          })
        } else {
          onGranted()
        }
      },
      fail() {
        if (wx.authorize) {
          wx.authorize({
            scope: 'scope.record',
            success: onGranted,
            fail: showPermissionModal
          })
        } else {
          onGranted()
        }
      }
    })
    return
  }

  if (wx.authorize) {
    wx.authorize({
      scope: 'scope.record',
      success: onGranted,
      fail: showPermissionModal
    })
  } else {
    onGranted()
  }
}

module.exports = {
  ensureRecordPermission
}
