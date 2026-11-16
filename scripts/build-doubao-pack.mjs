#!/usr/bin/env node
// 把一集项目里的文档合成「豆包投喂包」：一个文件读完全集规则。
//
//   node scripts/build-doubao-pack.mjs <项目目录> [--stage all|image|video] [--out 路径]
//
// stage=image  只打包资产卡 + 首帧合成单（出图用）
// stage=video  只打包图生视频生成单 + 生成注意（出视频用）
// stage=all    全打包（默认，一次读完整个项目）

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
if (args.length === 0 || args[0].startsWith('--')) {
  console.error('用法：node scripts/build-doubao-pack.mjs <项目目录> [--stage all|image|video] [--out 路径]')
  process.exit(2)
}

const projectDir = path.resolve(args[0])
const stageArg = args.indexOf('--stage')
const stage = stageArg > -1 ? (args[stageArg + 1] || 'all') : 'all'
const outArg = args.indexOf('--out')
const outPath = outArg > -1 ? path.resolve(args[outArg + 1]) : path.join(projectDir, '_豆包投喂包.md')

const LAYOUT = {
  image: [
    '00_项目说明.md',
    { dir: '03_角色设定', glob: /^C\d/ },
    { dir: '04_场景设定', glob: /^SC\d/ },
    { dir: '05_道具设定', glob: /^P\d/ },
    '07_首帧图/01_场镜/_首帧合成单.md',
  ],
  video: ['06_分镜', '08_视频片段/_视频生成单.md', '08_视频片段/_生成注意.md'],
  all: [
    '00_项目说明.md',
    { dir: '03_角色设定', glob: /^C\d/ },
    { dir: '04_场景设定', glob: /^SC\d/ },
    { dir: '05_道具设定', glob: /^P\d/ },
    '06_分镜',
    '07_首帧图/01_场镜/_首帧合成单.md',
    '08_视频片段/_视频生成单.md',
    '08_视频片段/_生成注意.md',
  ],
}

function collect(entry) {
  if (typeof entry === 'string') {
    const target = path.join(projectDir, entry)
    if (!fs.existsSync(target)) return []
    if (fs.statSync(target).isDirectory()) {
      return fs
        .readdirSync(target)
        .filter((name) => name.endsWith('.md') && !name.includes('模板'))
        .sort()
        .map((name) => path.join(target, name))
    }
    return [target]
  }
  const target = path.join(projectDir, entry.dir)
  if (!fs.existsSync(target)) return []
  return fs
    .readdirSync(target)
    .filter((name) => entry.glob.test(name) && name.endsWith('.md'))
    .sort()
    .map((name) => path.join(target, name))
}

const files = LAYOUT[stage]
if (!files) {
  console.error(`未知 stage：${stage}（可选 all / image / video）`)
  process.exit(2)
}

const seen = new Set()
const picked = []
for (const entry of files) {
  for (const file of collect(entry)) {
    if (seen.has(file)) continue
    seen.add(file)
    picked.push(file)
  }
}

if (picked.length === 0) {
  console.error(`在 ${projectDir} 下没有找到可打包的文档`)
  process.exit(1)
}

const projectName = path.basename(projectDir)
const header = [
  `# 豆包投喂包 · ${projectName}`,
  '',
  `> 用途：让豆包一次读完这一集的全部规则、资产与镜头，再按指令逐镜生成。`,
  `> 打包方式：\`node scripts/build-doubao-pack.mjs <项目目录> --stage ${stage}\``,
  `> 包含 ${picked.length} 个文档：`,
  '',
  ...picked.map((file) => `> - ${path.relative(projectDir, file).split(path.sep).join('/')}`),
  '',
  '---',
  '',
  '**读完后请遵守的三条总则**',
  '',
  '1. 只做我指明的那一个镜号，不要一次性处理多个镜头。',
  '2. 人物必须是附件里那张脸，不得换脸、不得换造型、不得放大到占满画面。',
  '3. 成图/成片里不得出现任何文字、字幕、水印、红绿框。',
  '',
  '---',
  '',
]

const parts = []
for (const file of picked) {
  const rel = path.relative(projectDir, file).split(path.sep).join('/')
  const body = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  parts.push(`\n\n<!-- ===== ${rel} ===== -->\n\n# 【文件】${rel}\n\n${body.trim()}\n`)
}

fs.writeFileSync(outPath, header.join('\n') + parts.join('\n'), 'utf8')
const kb = Math.round(fs.statSync(outPath).size / 1024)
console.log(`已生成 ${path.relative(process.cwd(), outPath)}（${picked.length} 个文档，${kb} KB）`)
for (const file of picked) console.log(`  + ${path.relative(projectDir, file).split(path.sep).join('/')}`)
