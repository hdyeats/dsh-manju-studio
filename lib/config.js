import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package root: <repo>/lib/config.js -> <repo>/ */
export const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Where the optional user configuration lives. */
export const HOME_CONFIG = path.join(os.homedir(), '.dsh-manju-studio.json')

/** The project subdirectories, in pipeline order. */
export const PROJECT_DIRS = [
  '01_原作',
  '02_剧本',
  '03_角色设定',
  '04_场景设定',
  '05_道具设定',
  '06_分镜',
  '07_首帧图/00_资产/角色',
  '07_首帧图/00_资产/场景',
  '07_首帧图/01_场镜',
  '08_视频片段',
  '09_配音',
  '10_成片',
  '11_封面与发布',
]

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** The user's own config file: ~/.dsh-manju-studio.json */
function readHomeConfig() {
  try {
    const text = fs.readFileSync(HOME_CONFIG, 'utf8').replace(/^\uFEFF/, '')
    const raw = JSON.parse(text)
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

/** Walk up from `from` and yield `<parent>/<rel>` for each ancestor. */
function upward(from, rel, depth = 6) {
  const found = []
  let current = path.resolve(from)
  for (let i = 0; i <= depth; i += 1) {
    found.push(path.join(current, rel))
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return found
}

/**
 * Resolve the three data folders.
 *
 * Precedence: row config > ~/.dsh-manju-studio.json > MANJU_* environment
 * variables > the conventional workshop layout near cwd, its ancestors and home.
 *
 * The Host process usually runs with the DSH profile as its working directory,
 * so the ancestor and home fallbacks matter more than cwd itself.
 */
export function resolveConfig(raw = {}) {
  const cwd = process.cwd()
  const home = os.homedir()
  const file = readHomeConfig()
  const env = process.env

  const asDir = (value) => (value ? path.resolve(cwd, String(value)) : '')

  const choose = (candidates) => {
    for (const candidate of candidates) {
      if (candidate && isDir(candidate)) return candidate
    }
    return ''
  }

  const libraryRoot = choose([
    asDir(raw.libraryRoot),
    asDir(file.libraryRoot),
    asDir(env.MANJU_LIBRARY_ROOT),
    path.join(cwd, '01_提示词库'),
    path.join(cwd, 'AI漫剧工坊', '01_提示词库'),
    ...upward(cwd, '01_提示词库'),
    ...upward(cwd, path.join('AI漫剧工坊', '01_提示词库')),
    path.join(home, 'AI漫剧工坊', '01_提示词库'),
  ])

  const voicesRoot = choose([
    asDir(raw.voicesRoot),
    asDir(file.voicesRoot),
    asDir(env.MANJU_VOICES_ROOT),
    path.join(cwd, '02_音色库'),
    path.join(cwd, 'AI漫剧工坊', '02_音色库'),
    ...upward(cwd, '02_音色库'),
    ...upward(cwd, path.join('AI漫剧工坊', '02_音色库')),
    path.join(home, 'AI漫剧工坊', '02_音色库'),
  ])

  const projectsRoot =
    choose([
      asDir(raw.projectsRoot),
      asDir(file.projectsRoot),
      asDir(env.MANJU_PROJECTS_ROOT),
      path.join(cwd, '06_项目'),
      path.join(cwd, 'AI漫剧工坊', '06_项目'),
      ...upward(cwd, '06_项目'),
      ...upward(cwd, path.join('AI漫剧工坊', '06_项目')),
      path.join(home, 'AI漫剧工坊', '06_项目'),
    ]) || path.join(home, 'AI漫剧工坊', '06_项目')

  return {
    libraryRoot,
    voicesRoot,
    projectsRoot,
    packageDir: PACKAGE_DIR,
    templatesDir: path.join(PACKAGE_DIR, 'templates'),
    libraryIndexPath: path.join(PACKAGE_DIR, 'library', 'index.json'),
    voiceIndexPath: path.join(PACKAGE_DIR, 'library', 'voice-index.json'),
    homeConfigPath: HOME_CONFIG,
    cwd,
  }
}

/** One-line diagnosis used by tools when a path is missing. */
export function describePaths(cfg) {
  return [
    `- libraryRoot: ${cfg.libraryRoot || '（未找到）'}`,
    `- voicesRoot: ${cfg.voicesRoot || '（未找到）'}`,
    `- projectsRoot: ${cfg.projectsRoot}`,
    `- 读取配置：${cfg.homeConfigPath}`,
    `- 宿主 cwd: ${cfg.cwd}`,
  ].join('\n')
}

/** Expand a project reference: absolute path, name inside projectsRoot, or cwd. */
export function resolveProject(cfg, project) {
  if (!project) return process.cwd()
  const direct = path.resolve(process.cwd(), project)
  if (isDir(direct)) return direct
  const inRoot = path.join(cfg.projectsRoot, project)
  if (isDir(inRoot)) return inRoot
  return direct
}

export function rel(cfg, target) {
  const base = cfg.projectsRoot
  const relative = path.relative(base, target)
  return relative.startsWith('..') ? target : relative
}
