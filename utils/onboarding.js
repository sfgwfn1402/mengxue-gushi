// 新手引导：首次欢迎 + 新手任务清单。状态存本地，做完对应动作自动勾选。
const WELCOME_KEY = 'onboardWelcomeSeen'
const STEP_PREFIX = 'onboardStep_'

const STEP_DEFS = [
  { key: 'learn', label: '学会第一首诗', desc: '在诗园挑一首，听讲解后点“学会”', target: 'warehouse' },
  { key: 'follow', label: '试试逐句跟读', desc: '学习页里“一句一句跟读”', target: 'warehouse' },
  { key: 'recite', label: '背一首诗', desc: '学习页“背诵闯关”逐句遮挡', target: 'warehouse' },
  { key: 'collection', label: '看孩子的诗集', desc: '“我的”里点亮的诗集墙', target: 'profile' }
]

function welcomeSeen() {
  return !!wx.getStorageSync(WELCOME_KEY)
}

function setWelcomeSeen() {
  try { wx.setStorageSync(WELCOME_KEY, true) } catch (e) {}
}

function markStep(key) {
  try { wx.setStorageSync(STEP_PREFIX + key, true) } catch (e) {}
}

function isStepDone(key) {
  return !!wx.getStorageSync(STEP_PREFIX + key)
}

function getSteps() {
  return STEP_DEFS.map((s, i) => ({ key: s.key, label: s.label, desc: s.desc, target: s.target, index: i + 1, done: isStepDone(s.key) }))
}

function doneCount() {
  return STEP_DEFS.filter(s => isStepDone(s.key)).length
}

function allDone() {
  return doneCount() === STEP_DEFS.length
}

module.exports = {
  welcomeSeen,
  setWelcomeSeen,
  markStep,
  isStepDone,
  getSteps,
  doneCount,
  allDone,
  total: STEP_DEFS.length
}
