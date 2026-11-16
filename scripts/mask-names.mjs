#!/usr/bin/env node
// Mask modern real-person names in library/voice-index.json to pinyin initials,
// so the shipped index can live in a public repository.
//
//   node scripts/mask-names.mjs            # rewrite library/voice-index.json in place
//   node scripts/mask-names.mjs --check     # report what would change, write nothing
//
// Policy:
//   - modern / recent real people (celebrities, anchors, streamers, voice actors,
//     personal names in folder names) -> pinyin initials
//   - fictional characters, classical-novel figures, platform voice-brand names,
//     roles and descriptive names stay as they are
//
// Longest names are replaced first so 李立群 wins over 李立.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(repo, 'library', 'voice-index.json')
const localFile = path.join(repo, 'library', 'voice-index.local.json')
const source = fs.existsSync(localFile) ? localFile : target
const check = process.argv.includes('--check')

/** Modern real people -> pinyin initials. */
export const MASK = {
  // 影视 / 综艺 / 公众人物
  刘亦菲: 'LYF',
  林志玲: 'LZL',
  范冰冰: 'FBB',
  周杰伦: 'ZJL',
  周星驰: 'ZXC',
  周星星: 'ZXX',
  杨幂: 'YM',
  董卿: 'DQ',
  撒贝宁: 'SBN',
  康辉: 'KH',
  周涛: 'ZT',
  潘涛: 'PT',
  董宇辉: 'DYH',
  樊登: 'FD',
  曾仕强: 'ZSQ',
  李玫瑾: 'LMJ',
  涂磊: 'TL',
  张雪峰: 'ZXF',
  张国立: 'ZGL',
  李立群: 'LLQ',
  李立宏: 'LLH',
  王志文: 'WZW',
  王安宇: 'WAY',
  郑晓宁: 'ZXN',
  曾志伟: 'CZW',
  郝邵文: 'HSW',
  范志毅: 'FZY',
  赵今麦: 'ZJM',
  靳东: 'JD',
  郭德纲: 'GDG',
  沈磊: 'SL',
  孙正聿: 'SZY',
  麦克阿瑟: 'MKAS',
  蒋介石: 'JSJ',
  蒋校长: 'JXZ',
  // 网络 / 主播 / 讲师
  丁真: 'DZ',
  雷军: 'LJ',
  周文强: 'ZWQ',
  孙笑川: 'SXC',
  卢本伟: 'LBW',
  大司马: 'DSM',
  蔡徐坤: 'CXK',
  邓紫琪: 'DZQ',
  范小勤: 'FXQ',
  张琦: 'ZQ',
  张璐: 'ZL',
  刘青龙: 'LQL',
  刘秋龙: 'LQL',
  钟南山: 'ZNS',
  // 配音员 / 主播 / 个人姓名
  刘十一: 'LS',
  刘双双: 'LSS',
  刘晓艳: 'LXY',
  周野芒: 'ZYM',
  周西英: 'ZXY',
  周建设: 'ZJS',
  冯春祥: 'FCX',
  付雅雯: 'FYW',
  曹丽娇: 'CLJ',
  邵颖萍: 'SYP',
  郭继承: 'GJC',
  郭方正: 'GFZ',
  王立宁: 'WLN',
  盛国恒: 'SGH',
  国恒: 'GH',
  赵一舟: 'ZYZ',
  赵清晨: 'ZQC',
  赵宇昊: 'ZYH',
  赵胜胜: 'ZSS',
  郑翔州: 'ZXZ',
  郑翔洲: 'ZXZ',
  苏华仁: 'SHR',
  杨咩咩: 'YMM',
  杨慧: 'YH',
  杨农: 'YN',
  陶矜: 'TJ',
  桃千: 'TQ',
  张德山: 'ZDS',
  王琨: 'WK',
  王坤: 'WK',
  王梓: 'WZ',
  王也: 'WY',
  琨哥: 'KG',
  琨知道: 'KZD',
  赵然: 'ZR',
  赵阳: 'ZY',
  郑伟: 'ZW',
  李玲: 'LL',
  心宇: 'XY',
  承安: 'CA',
  曲腰: 'QY',
  宋菲: 'SF',
  左新会: 'ZXH',
  惠鸿旭: 'HHX',
  扎西拉姆: 'ZXLM',
  朱珊: 'ZS',
  莫潇羽: 'MXY',
  袁野: 'YY',
  詩函: 'SH',
  陈彤云: 'CTY',
  陈晓: 'CX',
  高瑾: 'GJ',
  龚晓: 'GX',
  陆绮娇: 'LQJ',
  董超: 'DC',
  迷罗: 'ML',
  纳希: 'NX',
  // 音色文件 目录里的人员姓名
  丽娟: 'LJ',
  彩霞: 'CX',
  桂兰: 'GL',
  海燕: 'HY',
  淑芬: 'SF',
  秀珍: 'XZ',
  红梅: 'HM',
}

const ordered = Object.keys(MASK).sort((a, b) => b.length - a.length)

function maskText(text) {
  let out = String(text || '')
  for (const name of ordered) {
    if (out.includes(name)) out = out.split(name).join(MASK[name])
  }
  return out
}

const raw = JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, ''))
const items = Array.isArray(raw) ? raw : raw.items

let changed = 0
for (const item of items) {
  const name = maskText(item.name)
  const group = maskText(item.group)
  if (name !== item.name || group !== item.group) {
    changed += 1
    item.name = name
    item.group = group
  }
}

const remaining = ordered.filter((name) => items.some((item) => `${item.name} ${item.group}`.includes(name)))

console.log(`来源 ${path.relative(repo, source)} → 目标 ${path.relative(repo, target)}`)
console.log(`条目 ${items.length}，改名 ${changed} 条`)
console.log(`字典 ${ordered.length} 条，残留 ${remaining.length}${remaining.length ? '：' + remaining.join('、') : ''}`)

if (check) {
  for (const item of items.slice(0, 5)) console.log(`  ${item.name}`)
  process.exit(remaining.length === 0 ? 0 : 1)
}

const out = Array.isArray(raw)
  ? items
  : { ...raw, masked: true, maskedAt: new Date().toISOString(), note: 'Real-person names replaced with pinyin initials; run npm run build:voices locally for the full index.' , items }
fs.writeFileSync(target, JSON.stringify(out), 'utf8')
console.log(`已写入 ${path.relative(repo, target)}`)
for (const item of items.slice(0, 5)) console.log(`  ${item.name}`)
process.exit(remaining.length === 0 ? 0 : 1)
