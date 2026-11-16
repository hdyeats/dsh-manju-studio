#!/usr/bin/env node
// Build the machine-local voice index (real file names) from a voice library folder.
//   node scripts/build-voice-index.mjs "F:\...\02_音色库\800+音色"
// Defaults to ./02_音色库/800+音色, then ./AI漫剧工坊/02_音色库/800+音色.
//
// Writes library/voice-index.local.json, which is git-ignored and overrides the
// masked index shipped in the repository. To refresh the public masked index,
// run `node scripts/mask-names.mjs` afterwards.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AUDIO = /\.(mp3|wav|m4a|flac|aac|ogg)$/i

function firstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate
    } catch {
      /* next */
    }
  }
  return ''
}

const arg = process.argv[2]
const root = arg
  ? path.resolve(arg)
  : firstExisting([
      path.join(process.cwd(), '02_音色库', '800+音色'),
      path.join(process.cwd(), 'AI漫剧工坊', '02_音色库', '800+音色'),
      path.join(repo, '..', 'AI漫剧工坊', '02_音色库', '800+音色'),
    ])

if (!root) {
  console.error('找不到音色目录。用法：node scripts/build-voice-index.mjs <音色库目录>')
  process.exit(2)
}

const items = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const child = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(child)
      continue
    }
    if (!AUDIO.test(entry.name)) continue
    const rel = path.relative(root, child).split(path.sep)
    items.push({
      name: entry.name,
      category: rel.length > 1 ? rel[0] : '',
      group: rel.length > 2 ? rel.slice(1, -1).join('/') : '',
      format: path.extname(entry.name).slice(1).toLowerCase(),
      sizeKB: Math.round(fs.statSync(child).size / 1024),
    })
  }
}
walk(root)

items.sort((a, b) => `${a.category}${a.group}${a.name}`.localeCompare(`${b.category}${b.group}${b.name}`))
const target = path.join(repo, 'library', 'voice-index.local.json')
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, JSON.stringify({ generatedAt: new Date().toISOString(), source: path.basename(root), masked: false, items }), 'utf8')

const byCategory = new Map()
for (const item of items) byCategory.set(item.category, (byCategory.get(item.category) || 0) + 1)
console.log(`写入 ${path.relative(repo, target)}：${items.length} 条（本地完整版，不入库）`)
for (const [category, count] of byCategory) console.log(`  ${category || '(根目录)'}: ${count}`)
console.log('提示：要更新仓库里的脱敏版，再跑 node scripts/mask-names.mjs')
