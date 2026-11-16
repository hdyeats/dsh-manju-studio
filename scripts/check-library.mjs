#!/usr/bin/env node
// Verify that every prompt in library/index.json resolves inside a local prompt library.
//   node scripts/check-library.mjs "F:\...\01_提示词库"
// Exit code 1 when any prompt is missing.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadIndex, resolveFile } from '../lib/library.js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = process.argv[2]

const cfg = {
  libraryRoot: arg ? path.resolve(arg) : path.join(process.cwd(), '01_提示词库'),
  libraryIndexPath: path.join(repo, 'library', 'index.json'),
}

if (!cfg.libraryRoot) {
  console.error('用法：node scripts/check-library.mjs <提示词库目录>')
  process.exit(2)
}

const entries = loadIndex(cfg)
let missing = 0
console.log(`提示词库：${cfg.libraryRoot}`)
console.log(`索引条目：${entries.length}`)
console.log('')

for (const entry of entries) {
  const file = resolveFile(cfg, entry)
  if (file) {
    console.log(`  ok    ${entry.id.padEnd(26)} ${path.basename(file)}`)
  } else {
    missing += 1
    console.log(`  MISS  ${entry.id.padEnd(26)} 期望：${entry.file}`)
  }
}

console.log('')
console.log(missing === 0 ? `全部可解析（${entries.length}/${entries.length}）` : `缺少 ${missing} 个文件`)
process.exit(missing === 0 ? 0 : 1)
