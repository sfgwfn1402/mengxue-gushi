// utils/track.js - 极简埋点：批量、防抖、fire-and-forget，绝不阻塞或抛错
const api = require('./api')

let buffer = []
let flushTimer = null
const FLUSH_DELAY = 4000   // 攒 4 秒一起发
const MAX_BUFFER = 10      // 满 10 条立即发

function currentPage() {
  try {
    const pages = getCurrentPages ? getCurrentPages() : []
    const cur = pages[pages.length - 1]
    return cur && cur.route ? cur.route : ''
  } catch (e) {
    return ''
  }
}

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!buffer.length) return
  const batch = buffer
  buffer = []
  // 静默上报，失败丢弃不重试，不影响任何业务流程
  api.trackEvents(batch).catch(() => {})
}

function scheduleFlush() {
  if (buffer.length >= MAX_BUFFER) {
    flush()
    return
  }
  if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_DELAY)
  }
}

/**
 * 记录一个事件
 * @param {string} event 事件名（如 poem_learn、ai_score_used、share_clicked）
 * @param {object} [props] 附加属性（如 { poem_id: 12, type: 'invite' }）
 */
function track(event, props) {
  if (!event || typeof event !== 'string') return
  try {
    buffer.push({
      event: event.slice(0, 64),
      page: currentPage(),
      props: props && typeof props === 'object' ? props : undefined
    })
    scheduleFlush()
  } catch (e) {}
}

module.exports = { track, flush }
