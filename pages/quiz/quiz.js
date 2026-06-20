// pages/quiz/quiz.js
const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    type: 'poem', // poem 或 idiom
    questions: [],
    current: 0,
    selectedOption: '',
    isCorrect: null,
    showHint: false,
    score: 0,
    isComplete: false,
    quizTaskSynced: false,
    scoreMessage: '',
    passScore: 3
  },

  onLoad(options) {
    const { mode } = options
    const type = mode === 'idiom' ? 'idiom' : 'poem'

    this.setData({ type })
    wx.setNavigationBarTitle({
      title: type === 'poem' ? '古诗选择题' : '成语选择题'
    })
    this.loadQuestions()
  },

  loadQuestions() {
    if (this.data.type === 'idiom') {
      this.setupQuestions(this.generateIdiomQuestions())
      return
    }

    Promise.all([
      Promise.resolve((app.getPoems && app.getPoems()) || app.globalData.poems || []),
      api.listProgress().catch(() => []),
      api.getTodayPoem().catch(() => null)
    ])
      .then(([poems, progressItems, todayPoem]) => {
        this.setupQuestions(this.generatePoemQuestions(poems, progressItems, todayPoem))
      })
      .catch(err => {
        console.warn('加载答题题目失败', err)
        this.setupQuestions(this.generatePoemQuestions((app.getPoems && app.getPoems()) || app.globalData.poems || [], [], null))
      })
  },

  setupQuestions(questions) {
    const safeQuestions = questions.slice(0, 5)
    this.setData({
      questions: safeQuestions,
      current: 0,
      selectedOption: '',
      isCorrect: null,
      showHint: false,
      score: 0,
      isComplete: safeQuestions.length === 0,
      quizTaskSynced: false,
      scoreMessage: this.getScoreMessage(0, safeQuestions.length)
    })
  },

  generatePoemQuestions(poems, progressItems, todayPoem) {
    const allPoems = (poems || []).filter(p => p && p.content)
    const poemMap = new Map(allPoems.map(p => [Number(p.id), p]))
    const learnedIds = new Set((progressItems || [])
      .filter(item => item && item.learned)
      .map(item => Number(item.poem_id || item.poemId)))

    const preferred = []
    if (todayPoem && todayPoem.content) preferred.push(todayPoem)
    allPoems.forEach(poem => { if (learnedIds.has(Number(poem.id))) preferred.push(poem) })

    const uniquePreferred = this.uniqueById(preferred)
    const source = this.uniqueById(uniquePreferred.concat(allPoems)).slice(0, Math.max(5, allPoems.length))
    const optionChars = this.collectPoemChars(allPoems)

    return this.shuffle(source)
      .map(poem => this.buildPoemQuestion(poemMap.get(Number(poem.id)) || poem, optionChars))
      .filter(Boolean)
      .slice(0, 5)
  },

  buildPoemQuestion(poem, optionChars) {
    const lines = String(poem.content || '')
      .replace(/[？！；]/g, '。')
      .split(/[，。]/)
      .map(l => l.trim())
      .filter(l => l.length >= 2)
    const randomLine = lines[Math.floor(Math.random() * lines.length)] || poem.title || ''
    const chars = randomLine.replace(/[，。！？；、\s]/g, '').split('').filter(Boolean)
    if (!chars.length) return null

    const answer = chars[Math.floor(Math.random() * chars.length)]
    const line = randomLine.replace(answer, '____')
    const options = this.buildOptions(answer, optionChars)

    return {
      poemId: poem.id,
      line,
      answer,
      options,
      hint: `这句诗来自《${poem.title || '古诗'}》，作者${poem.author || '佚名'}`,
      explain: `正确答案是「${answer}」。来自《${poem.title || '古诗'}》。`
    }
  },

  collectPoemChars(poems) {
    const chars = []
    ;(poems || []).forEach(poem => {
      String(poem.content || '')
        .replace(/[，。！？；、\s]/g, '')
        .split('')
        .forEach(ch => chars.push(ch))
    })
    return chars.length ? chars : '天地山水风月花鸟春秋上下日明白'.split('')
  },

  generateIdiomQuestions() {
    const idioms = app.globalData.idioms || []
    const words = idioms.map(i => i.word)

    return this.shuffle(idioms)
      .map(idiom => ({
        idiomId: idiom.id,
        hint: idiom.story,
        answer: idiom.word,
        options: this.buildOptions(idiom.word, words),
        explain: `正确答案是「${idiom.word}」：${idiom.meaning || ''}`
      }))
      .slice(0, 5)
  },

  buildOptions(answer, pool) {
    const options = [answer]
    const candidates = this.shuffle((pool || []).filter(item => item && item !== answer))
    candidates.forEach(item => {
      if (options.length < 4 && !options.includes(item)) options.push(item)
    })
    while (options.length < 4) options.push(answer)
    return this.shuffle(options)
  },

  uniqueById(items) {
    const seen = new Set()
    return (items || []).filter(item => {
      const key = Number(item && item.id)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  },

  shuffle(items) {
    const arr = (items || []).slice()
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  },

  chooseOption(e) {
    if (this.data.isCorrect !== null) return
    const { value } = e.currentTarget.dataset
    const question = this.data.questions[this.data.current]
    if (!question) return

    const correct = value === question.answer
    const nextScore = correct ? this.data.score + 1 : this.data.score
    this.syncQuizResult(question, correct)
    this.setData({
      selectedOption: value,
      isCorrect: correct,
      score: nextScore,
      scoreMessage: this.getScoreMessage(nextScore, this.data.questions.length)
    })
  },

  showHint() {
    this.setData({ showHint: true })
  },

  nextQuestion() {
    const { current, questions, isCorrect } = this.data
    if (isCorrect === null) {
      wx.showToast({ title: '先选一个答案吧～', icon: 'none' })
      return
    }

    if (current + 1 >= questions.length) {
      this.setData({ isComplete: true })
      this.completeQuizTask()
    } else {
      this.setData({
        current: current + 1,
        selectedOption: '',
        isCorrect: null,
        showHint: false
      })
    }
  },

  syncQuizResult(question, correct) {
    if (!question) return

    if (this.data.type === 'idiom' && question.idiomId) {
      api.updateIdiomProgress({
        idiom_id: question.idiomId,
        quiz_correct_delta: correct ? 1 : 0,
        quiz_wrong_delta: correct ? 0 : 1
      }).catch(err => console.warn('同步成语答题结果失败', err))
    }
  },

  getScoreMessage(score, total) {
    if (!total) return '题目还没准备好，稍后再试试～'
    if (score >= 5) return '满分！你是古诗小天才！🎓'
    if (score >= 3) return '挑战成功！诗光到手啦！✨'
    if (score >= 1) return '已经很棒啦，再来一次就能拿诗光！💪'
    return '别灰心，看看提示再试一次～📚'
  },

  restart() {
    this.loadQuestions()
  },

  completeQuizTask() {
    if (this.data.quizTaskSynced) return
    this.setData({ quizTaskSynced: true })

    if (this.data.score < this.data.passScore) return

    // 今日答题练习：一轮 5 题，答对至少 3 题才 +3 星；后端保证当天不重复加星。
    api.completeTask('quiz3', 3)
      .then(res => {
        const added = res && typeof res.stars_added === 'number' ? res.stars_added : 0
        if (added > 0) wx.showToast({ title: `答题练习完成 +${added}✨`, icon: 'none', duration: 1800 })
      })
      .catch(err => console.warn('同步答题任务失败', err))
  },

  goBack() {
    wx.navigateBack()
  }
})
