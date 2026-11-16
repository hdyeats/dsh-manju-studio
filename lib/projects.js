import fs from 'node:fs'
import path from 'node:path'

import { PROJECT_DIRS, rel } from './config.js'
import { TEMPLATES } from './templates.js'

function safeName(text) {
  return String(text).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
}

/** Local calendar date as YYYYMMDD (not UTC: a 02:00 local run must not land on yesterday). */
function localStamp(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export function initProject(cfg, { name, episode = 1, root } = {}) {
  const projectName = safeName(name || '未命名')
  const ep = Number.isInteger(episode) && episode > 0 ? episode : 1
  const base = root ? path.resolve(process.cwd(), root) : cfg.projectsRoot
  const stamp = localStamp()
  const dirName = `${stamp}_${projectName}_EP${String(ep).padStart(2, '0')}`
  const dir = path.join(base, dirName)

  if (fs.existsSync(dir)) {
    return { created: false, dir, existing: true }
  }

  fs.mkdirSync(dir, { recursive: true })
  for (const sub of PROJECT_DIRS) fs.mkdirSync(path.join(dir, sub), { recursive: true })

  const vars = { name: projectName, episode: ep }
  const written = []
  for (const [file, build] of Object.entries(TEMPLATES)) {
    const target = path.join(dir, file.split('/').join(path.sep))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, build(vars), 'utf8')
    written.push(file)
  }

  return { created: true, dir, projectName, episode: ep, written, relative: rel(cfg, dir) }
}

const CHECKS = [
  { n: 1, files: ['01_原作/00_合规体检与分集.md'], label: '体检与分集' },
  { n: 2, files: ['02_剧本/01_改文定稿.md'], label: '改文定稿' },
  { n: 3, files: ['02_剧本/03_剧本块.md'], label: '剧本块' },
  { n: 4, files: ['02_剧本/02_分场表.md'], label: '分场表' },
  { n: 6, dirs: ['03_角色设定'], anyFile: true, label: '角色卡' },
  { n: 7, dirs: ['07_首帧图/00_资产/角色', '07_首帧图/00_资产/场景'], anyFile: true, label: '资产图' },
  { n: 8, files: ['06_分镜'], anyFile: true, label: '分镜' },
  { n: 9, dirs: ['07_首帧图/01_场镜'], anyFile: true, label: '首帧图' },
  { n: 10, dirs: ['08_视频片段'], anyFile: true, label: '视频片段' },
  { n: 11, files: ['09_配音/台词表.csv'], label: '台词表' },
  { n: 12, dirs: ['10_成片'], anyFile: true, label: '成片' },
]

function countFiles(target) {
  try {
    if (!fs.statSync(target).isDirectory()) return fs.existsSync(target) ? 1 : 0
  } catch {
    return 0
  }
  let count = 0
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue
    const child = path.join(target, entry.name)
    count += entry.isDirectory() ? countFiles(child) : 1
  }
  return count
}

export function projectStatus(cfg, dir) {
  const rows = []
  for (const check of CHECKS) {
    let count = 0
    const targets = [...(check.files || []), ...(check.dirs || [])]
    for (const target of targets) count += countFiles(path.join(dir, target))
    const done = check.anyFile ? count > 0 : targets.every((t) => countFiles(path.join(dir, t)) > 0)
    rows.push({ step: check.n, label: check.label, done, count })
  }

  // 风格锁定：占位符还在 = 未锁定
  let style = ''
  try {
    const note = fs.readFileSync(path.join(dir, '00_项目说明.md'), 'utf8')
    const match = note.match(/\|\s*\*\*锁定风格\*\*\s*\|\s*([^|]*)\|/)
    style = match ? match[1].trim() : ''
  } catch {
    style = ''
  }
  const styleLocked = Boolean(style) && !style.includes('选一个')

  return { dir, rows, style, styleLocked }
}

export function nextPending(status) {
  const missing = status.rows.find((row) => !row.done)
  if (missing) return missing.step
  if (!status.styleLocked) return 5
  return 13
}
