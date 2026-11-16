#!/usr/bin/env node
// 从分镜文件导出「图生视频」逐镜粘贴卡。
//
//   node scripts/export-video-cards.mjs <分镜.md> <场景镜数,逗号分隔> [输出.md]
//   node scripts/export-video-cards.mjs "06_分镜/EP01_分镜.md" 4,5,2
//
// 只抽 [起-止秒] 时间轴行（不含衔接声明、状态卡），并附画质括号与负向词，
// 顺序与分镜一致，镜号按「场-镜」重编（EP01_S01-01 …）。

import fs from 'node:fs'
import path from 'node:path'

const [, , src, sceneCounts, outArg] = process.argv

if (!src || !sceneCounts) {
  console.error('用法：node scripts/export-video-cards.mjs <分镜.md> <场景镜数,逗号分隔> [输出.md] [--prefix EP01_]')
  process.exit(2)
}

const prefixArg = process.argv.indexOf('--prefix')
const prefix = prefixArg > -1 ? (process.argv[prefixArg + 1] || '') : ''

const counts = sceneCounts.split(',').map((n) => Number(n.trim()))
if (counts.some((n) => !Number.isInteger(n) || n <= 0)) {
  console.error('场景镜数必须是正整数，例如 4,5,2')
  process.exit(2)
}

const text = fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, '')
const blocks = [...text.matchAll(/^###\s*分镜(\d+)\s*$/gm)].map((m, i, all) => {
  const start = m.index
  const end = i + 1 < all.length ? all[i + 1].index : text.length
  return { n: Number(m[1]), body: text.slice(start, end) }
})

if (blocks.length === 0) {
  console.error('没有找到 `### 分镜N`')
  process.exit(1)
}

// 分镜序号 → 场-镜
const mapping = []
let n = 0
counts.forEach((count, sceneIndex) => {
  for (let i = 1; i <= count; i += 1) {
    n += 1
    mapping[n] = `S${String(sceneIndex + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
  }
})

const QUALITY = '（使用中文对话，无字幕，自动配音，画面禁止出现任何文字，无背景音乐，完美的手，丝滑连贯的动作，允许自行优化镜头画面）'
const NEGATIVE = '负向：换脸、换造型、消失、多出人物、文字、字幕、水印、慢动作（除标注升格）、镜头被切碎、人物比例失真、手指畸形'

const lines = []
lines.push(`# 图生视频生成单`)
lines.push('')
lines.push(`> 源文件：\`${path.basename(src)}\`　共 ${blocks.length} 镜 × 15 秒`)
lines.push('> 用法：每镜上传对应首帧图 → 粘贴下方时间轴 → 末尾已带画质括号与负向词。')
lines.push('> **首帧必须与该镜 `[0-4秒]` 描述一致**，否则视频一动就跳。')
lines.push('')
lines.push('## 通用负向词（每镜都贴）')
lines.push('')
lines.push('```text')
lines.push(NEGATIVE)
lines.push('```')
lines.push('')
lines.push('---')
lines.push('')

let missing = 0
for (const block of blocks) {
  const shot = mapping[block.n] || `分镜${block.n}`
  const fenced = block.body.match(/```plaintext([\s\S]*?)```/)
  if (!fenced) {
    missing += 1
    continue
  }
  const timeLines = fenced[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\[\d+(?:\.\d+)?\s*[-–—~]\s*\d+(?:\.\d+)?\s*秒\]/.test(line))

  lines.push(`### ${shot}（分镜${block.n}）`)
  lines.push('')
  lines.push(`首帧：\`${prefix}${shot}.png\``)
  lines.push('')
  lines.push('```text')
  for (const line of timeLines) lines.push(line)
  lines.push(QUALITY)
  lines.push('```')
  lines.push('')
}

const out = outArg || path.join(path.dirname(src), '_视频生成单.md')
fs.writeFileSync(out, lines.join('\n'), 'utf8')
console.log(`已写入 ${path.relative(process.cwd(), out)}：${blocks.length - missing} 镜`)
if (mapping.length - 1 < blocks.length) {
  console.log(`⚠️ 场景镜数合计 ${mapping.length - 1} 少于分镜数 ${blocks.length}，超出部分按「分镜N」命名`)
}
if (missing > 0) console.log(`⚠️ ${missing} 个分镜缺少 plaintext 代码块，已跳过`)
