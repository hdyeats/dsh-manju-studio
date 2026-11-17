#!/usr/bin/env node
// 从分镜里抽出台词表 CSV（TTS / 配音用）。
//
//   node scripts/export-dialogue-csv.mjs <分镜.md> <场景镜数> <输出.csv>
//   node scripts/export-dialogue-csv.mjs "06_分镜/EP01_分镜.md" 4,5,2 "09_配音/台词表.csv"
//
// 输出列：镜号,时间段,角色,情绪,音色标签,台词,字数,估算秒
// 估算秒 = 字数 / 5.5（中文漫剧语速），并给出上限 5 秒的提示。

import fs from 'node:fs'
import path from 'node:path'

const [, , src, sceneCounts, outArg] = process.argv
if (!src || !sceneCounts) {
  console.error('用法：node scripts/export-dialogue-csv.mjs <分镜.md> <场景镜数> <输出.csv>')
  process.exit(2)
}

const counts = sceneCounts.split(',').map((n) => Number(n.trim()))
const text = fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, '')

const blocks = [...text.matchAll(/^###\s*分镜(\d+)\s*$/gm)].map((m, i, all) => {
  const start = m.index
  const end = i + 1 < all.length ? all[i + 1].index : text.length
  return { n: Number(m[1]), body: text.slice(start, end) }
})

const mapping = []
let seq = 0
counts.forEach((count, sceneIndex) => {
  for (let i = 1; i <= count; i += 1) {
    seq += 1
    mapping[seq] = `S${String(sceneIndex + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
  }
})

const TIME = /^\[(\d+(?:\.\d+)?)\s*[-–—~]\s*(\d+(?:\.\d+)?)\s*秒\]/
const LINE = /台词[:：]\s*"(.+?)"\s*（([^，,]+)[，,]\s*([^，,]+)[，,]\s*音色[:：]\s*([^）]+)）/

const esc = (v) => `"${String(v).replace(/"/g, '""')}"`
const rows = []
let silent = 0

for (const block of blocks) {
  const shot = mapping[block.n] || `分镜${block.n}`
  const fenced = block.body.match(/```plaintext([\s\S]*?)```/)
  if (!fenced) continue
  for (const raw of fenced[1].split(/\r?\n/)) {
    const line = raw.trim()
    const t = line.match(TIME)
    if (!t) continue
    const m = line.match(LINE)
    if (!m) {
      if (line.includes('[无台词]')) silent += 1
      continue
    }
    const dialogue = m[1]
    const speaker = m[2].trim()
    const mood = m[3].trim()
    const voice = m[4].trim()
    const words = dialogue.replace(/[，。！？、…—\s]/g, '').length
    const seconds = Math.round((dialogue.length / 5.5) * 10) / 10
    rows.push({ shot, span: `${t[1]}-${t[2]}s`, speaker, mood, voice, line: dialogue, words, seconds })
  }
}

const header = ['镜号', '时间段', '角色', '情绪', '音色标签', '台词', '字数', '估算秒', '超5秒?']
const csv = [
  header.join(','),
  ...rows.map((r) => [r.shot, r.span, r.speaker, r.mood, r.voice, esc(r.line), r.words, r.seconds, r.seconds > 5 ? '是' : ''].join(',')),
].join('\r\n')

fs.writeFileSync(outArg, `\uFEFF${csv}`, 'utf8')

const speakers = new Map()
for (const r of rows) speakers.set(r.speaker, (speakers.get(r.speaker) || 0) + 1)
console.log(`已写入 ${path.relative(process.cwd(), outArg)}`)
console.log(`台词行 ${rows.length} 条，无台词时段 ${silent} 段`)
console.log(`角色：${[...speakers.entries()].map(([k, v]) => `${k}(${v})`).join('、')}`)
const over = rows.filter((r) => r.seconds > 5)
if (over.length) {
  console.log(`⚠️ ${over.length} 条超过 5 秒上限：`)
  for (const r of over) console.log(`   ${r.shot} ${r.speaker} ${r.seconds}s  ${r.line.slice(0, 24)}…`)
}
