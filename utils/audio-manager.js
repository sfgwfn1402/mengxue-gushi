// utils/audio-manager.js
// 全局音频互斥管理：任意功能开始播放前，先停止其它功能的音频。
// 避免官方朗读、跟读分句、人气朗诵、录音预览等在不同页面/功能间串音。

const contexts = {}

function ignoreAudioPromise(ret) {
  if (ret && typeof ret.catch === 'function') {
    ret.catch(err => {
      const msg = err && err.errMsg ? err.errMsg : String(err || '')
      if (msg.includes('audioInstance is not set') || msg.includes('No one promise resolved')) return
      console.warn('音频操作被忽略的异步错误', err)
    })
  }
}

function safeStop(ctx) {
  if (!ctx) return
  try { ignoreAudioPromise(ctx.stop && ctx.stop()) } catch (e) {}
}

function safeDestroy(ctx) {
  if (!ctx) return
  try { ignoreAudioPromise(ctx.stop && ctx.stop()) } catch (e) {}
  try { ignoreAudioPromise(ctx.destroy && ctx.destroy()) } catch (e) {}
}

function register(key, ctx) {
  if (!key || !ctx) return ctx
  if (contexts[key] && contexts[key] !== ctx) {
    safeDestroy(contexts[key])
  }
  contexts[key] = ctx
  return ctx
}

function unregister(key, ctx) {
  if (!key) return
  if (!ctx || contexts[key] === ctx) {
    delete contexts[key]
  }
}

function stop(key) {
  safeStop(contexts[key])
}

function destroy(key) {
  safeDestroy(contexts[key])
  delete contexts[key]
}

function stopAll(exceptKey) {
  Object.keys(contexts).forEach(key => {
    if (exceptKey && key === exceptKey) return
    safeStop(contexts[key])
  })
}

function destroyAll(exceptKey) {
  Object.keys(contexts).forEach(key => {
    if (exceptKey && key === exceptKey) return
    safeDestroy(contexts[key])
    delete contexts[key]
  })
}

function create(key) {
  stopAll(key)
  const ctx = wx.createInnerAudioContext()
  ctx.obeyMuteSwitch = false
  register(key, ctx)
  return ctx
}

function play(ctx) {
  if (!ctx) return
  try { ignoreAudioPromise(ctx.play && ctx.play()) } catch (e) {
    const msg = e && e.errMsg ? e.errMsg : String(e || '')
    if (msg.includes('audioInstance is not set') || msg.includes('No one promise resolved')) return
    console.warn('音频播放同步错误', e)
  }
}

function playWithRetry(ctx, options = {}) {
  if (!ctx) return
  const attempts = options.attempts || 3
  const delay = options.delay || 220
  const shouldContinue = options.shouldContinue || (() => true)
  let count = 0
  const tryPlay = () => {
    if (!ctx || !shouldContinue()) return
    count += 1
    play(ctx)
    if (count < attempts) {
      setTimeout(() => {
        if (!ctx || !shouldContinue()) return
        // iOS/微信偶尔 set src 后第一次 play 被吞；如果还没进入播放态，补一次。
        if (!ctx.paused) return
        tryPlay()
      }, delay * count)
    }
  }
  tryPlay()
}

function pause(ctx) {
  if (!ctx) return
  try { ignoreAudioPromise(ctx.pause && ctx.pause()) } catch (e) {}
}

module.exports = {
  register,
  unregister,
  stop,
  destroy,
  stopAll,
  destroyAll,
  create,
  play,
  playWithRetry,
  pause,
  ignoreAudioPromise
}
