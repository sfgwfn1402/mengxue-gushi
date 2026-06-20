#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.join(__dirname, '..')
const outDir = path.join(root, 'audios')
const voice = process.env.VOICE || 'Tingting'

const fixes = {
  13: '两个黄鹂鸣翠柳，一行白鹭上青天。窗含西岭千秋雪，门泊东吴万里船。',
  18: '李白乘舟将欲行，忽闻岸上踏歌声。桃花潭水深千尺，不及汪伦送我情。',
  22: '李白乘舟将欲行，忽闻岸上踏歌声。桃花潭水深千尺，不及汪伦送我情。'
}

function loadAllPoems() {
  const levels = ['poems-level1.json', 'poems-level2.json', 'poems-level3.json']
  const byId = new Map()
  for (const file of levels) {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8'))
    for (const p of data.poems) {
      byId.set(p.id, p)
    }
  }
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

function cleanContent(poem) {
  if (fixes[poem.id]) return fixes[poem.id]
  return poem.content.replace(/[^\u4e00-\u9fff，。、；：？！""''（）\s]/g, '')
}

fs.mkdirSync(outDir, { recursive: true })
const poems = loadAllPoems()

const onlyMissing = process.argv.includes('--missing')

for (const p of poems) {
  const mp3 = path.join(outDir, `poem-${p.id}.mp3`)
  if (onlyMissing && fs.existsSync(mp3) && fs.statSync(mp3).size > 1000) {
    console.log(`skip poem-${p.id}.mp3 (${p.title})`)
    continue
  }
  const text = `${p.title}。${p.author}。${cleanContent(p)}`
  const aiff = path.join(os.tmpdir(), `mengxue-poem-${p.id}.aiff`)
  const mp3Tmp = path.join(os.tmpdir(), `mengxue-poem-${p.id}.mp3`)
  try {
    execFileSync('say', ['-v', voice, '-o', aiff, text])
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', aiff,
      '-ar', '16000', '-ac', '1', '-b:a', '24k', mp3Tmp
    ])
    fs.copyFileSync(mp3Tmp, mp3)
  } finally {
    for (const f of [aiff, mp3Tmp]) {
      try {
        fs.unlinkSync(f)
      } catch (_) {}
    }
  }
  console.log(`OK poem-${p.id}.mp3 (${p.title})`)
}

console.log(`\n完成：${poems.length} 首 -> ${outDir}/poem-{id}.mp3`)
