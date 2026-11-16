import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkCardBody, writeCard } from '../lib/cards.js'
import { scanCompliance } from '../lib/compliance.js'
import { resolveFile } from '../lib/library.js'
import { initProject, nextPending, projectStatus } from '../lib/projects.js'
import { checkStoryboard } from '../lib/storyboard.js'
import { searchVoices } from '../lib/voices.js'

const tmpRoots = []
function tmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `manju-${prefix}-`))
  tmpRoots.push(dir)
  return dir
}

after(() => {
  for (const dir of tmpRoots) fs.rmSync(dir, { recursive: true, force: true })
})

describe('compliance scan', () => {
  it('finds banned words with line and category', () => {
    const text = '第一行很正常\n他喷血而亡，随后血洗全场\n第三行'
    const result = scanCompliance(text)
    assert.ok(result.total >= 2)
    const words = result.hits.map((hit) => hit.word)
    assert.deepEqual(words.sort(), ['喷血', '血洗'].sort())
    assert.equal(result.hits[0].line, 2)
    assert.ok(result.counts.some((item) => item.category === '血腥暴力'))
  })

  it('returns zero hits for clean text and no false alarm on substrings', () => {
    assert.equal(scanCompliance('清晨的山门，薄雾未散。').total, 0)
  })

  it('keeps the longest match instead of double counting', () => {
    const result = scanCompliance('血洗城')
    assert.equal(result.total, 1)
  })
})

function storyboardBlock(number, { start = 0, end = 15, tone = true, status = true, bridge = true } = {}) {
  const lines = []
  if (number > 1 && bridge) {
    lines.push('【衔接上一镜画面和人物站位统一】')
    lines.push('- 空间锚点：前景=无；中景基准=门框；背景基准锚点=远山')
    lines.push('')
  }
  lines.push('```plaintext')
  lines.push('#### 镜头1（0-8秒）')
  lines.push(`[${start}-4秒]镜头:近景+推镜+他抬眼；音效:风声；台词:"你来了。"（苏墨，隐忍，音色：清朗少年）`)
  lines.push('[4-8秒]镜头:中景+横移+转身；音效:脚步；[无台词]')
  lines.push('【8秒】切')
  lines.push('#### 镜头2（8-15秒）')
  lines.push('[8-12秒]镜头:特写+固定+手部；音效:衣料摩擦；[无台词]')
  lines.push(`[12-${end}秒]镜头:远景+拉远+离去；音效:风声渐弱；[无台词]`)
  lines.push('```')
  if (status) {
    lines.push('')
    lines.push('【片段结尾状态卡】')
    lines.push(`- 分镜编号：分镜${number}`)
    lines.push('- 总时长：15秒')
    lines.push('- 资产变更状态：无变更')
    lines.push('- 空间锚点（终态）：前景=无；中景基准=门框；背景基准锚点=远山')
    lines.push('- 角色站位（终态）：苏墨→南-中景，朝向[北]，动作帧=[转身]，表情=[平静]')
    lines.push('- 光影状态（终态）：光源=西，强度=中，色温=冷')
    lines.push('- 道具状态（终态）：无')
    lines.push('- 情绪基线（终态）：苏墨=压抑')
    lines.push('- 衔接方式：切')
    lines.push('- 衔接容差校验：站位≤2%，动作连续≥95%，色温≤5%，道具≤2%，朝向≤10°')
  }
  if (tone === false) {
    lines.push('')
    lines.push('台词:"没有音色标注的一句"')
  }
  return `### 分镜${number}\n${lines.join('\n')}`
}

describe('storyboard check', () => {
  it('accepts a well-formed 15 second segment', () => {
    const result = checkStoryboard(storyboardBlock(1))
    assert.equal(result.blocks, 1)
    assert.equal(result.issues.filter((issue) => issue.level === 'error').length, 0)
  })

  it('flags a timeline gap', () => {
    const result = checkStoryboard(storyboardBlock(1, { start: 2, end: 15 }))
    assert.ok(result.issues.some((issue) => issue.level === 'error' && issue.message.includes('空档')))
  })

  it('flags a wrong total duration', () => {
    const result = checkStoryboard(storyboardBlock(1, { start: 0, end: 12 }))
    assert.ok(result.issues.some((issue) => issue.message.includes('总时长')))
  })

  it('requires the transition block from segment 2 on', () => {
    const result = checkStoryboard(storyboardBlock(2, { bridge: false }))
    assert.ok(result.issues.some((issue) => issue.message.includes('衔接上一镜')))
  })

  it('flags a missing voice tag and a missing status card', () => {
    const result = checkStoryboard(storyboardBlock(1, { tone: false, status: false }))
    assert.ok(result.issues.some((issue) => issue.message.includes('音色')))
    assert.ok(result.issues.some((issue) => issue.message.includes('片段结尾状态卡')))
  })
})

describe('card rules', () => {
  it('rejects a held prop, effects and pupil detail on a character card', () => {
    const body = '整体形态：修长\n头部：丹凤眼，瞳孔漆黑如墨\n上身：粗麻短褐，手持一柄长剑\n身上有淡淡灵光'
    const result = checkCardBody('character', body)
    assert.equal(result.errors.length, 3)
  })

  it('accepts a clean character card', () => {
    const body = '整体形态：身形修长清瘦\n头部：长菱形脸，丹凤眼，目光沉稳\n上身：粗麻短褐\n下身：长裤草鞋\n[构图标签] 四视图\n[风格标签] 3DCG 国漫'
    assert.deepEqual(checkCardBody('character', body).errors, [])
  })

  it('rejects dynamic words and people on a scene card', () => {
    const result = checkCardBody('scene', '环境主体：石门，符文飞舞\n光线氛围：柔和\n远景层次：隐约可见\n有一人影在门后')
    assert.ok(result.errors.some((error) => error.includes('动态词')))
    assert.ok(result.errors.some((error) => error.includes('人物')))
  })

  it('sanitizes path separators when writing a card file', () => {
    const project = tmpDir('cardwrite')
    const written = writeCard(project, 'character', { id: 'C01', name: '苏墨/少年', body: '整体形态：修长\n头部：丹凤眼' })
    assert.ok(written.path.endsWith('C01_苏墨_少年.md'))
    assert.ok(fs.existsSync(written.path))
  })
})

describe('project scaffolding', () => {
  it('creates the stage folders and templates, then reports pending steps', () => {
    const root = tmpDir('proj')
    const cfg = { projectsRoot: root }
    const created = initProject(cfg, { name: '无命人', episode: 2 })
    assert.equal(created.created, true)
    assert.ok(fs.existsSync(path.join(created.dir, '06_分镜')))
    assert.ok(fs.existsSync(path.join(created.dir, '00_项目说明.md')))
    assert.ok(fs.existsSync(path.join(created.dir, '09_配音', '_台词表模板.csv')))

    const note = fs.readFileSync(path.join(created.dir, '00_项目说明.md'), 'utf8')
    assert.ok(note.includes('无命人'))
    assert.ok(note.includes('EP02'))

    // 目录名必须用本地日期，不能用 UTC（凌晨跑会差一天）
    const now = new Date()
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    assert.ok(path.basename(created.dir).startsWith(stamp), `目录名应以 ${stamp} 开头`)

    const status = projectStatus(cfg, created.dir)
    assert.equal(status.styleLocked, false)
    assert.equal(nextPending(status), 1)

    fs.writeFileSync(path.join(created.dir, '01_原作', '00_合规体检与分集.md'), 'ok', 'utf8')
    assert.equal(nextPending(projectStatus(cfg, created.dir)), 2)
  })

  it('does not overwrite an existing project folder', () => {
    const root = tmpDir('proj2')
    const cfg = { projectsRoot: root }
    const first = initProject(cfg, { name: '同名', episode: 1 })
    const second = initProject(cfg, { name: '同名', episode: 1 })
    assert.equal(second.created, false)
    assert.equal(second.dir, first.dir)
  })
})

describe('prompt library resolution', () => {
  it('resolves the organized layout', () => {
    const root = tmpDir('lib1')
    const file = path.join(root, '02_剧本改编', '01_改文提示词（第一人称+钩子+精简）.txt')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'line1\nline2', 'utf8')
    const entry = { file: '02_剧本改编/01_改文提示词（第一人称+钩子+精简）.txt', legacy: '改文提示词(已更新).txt' }
    assert.equal(resolveFile({ libraryRoot: root }, entry), file)
  })

  it('falls back to the original flat file name', () => {
    const root = tmpDir('lib2')
    const file = path.join(root, '改文提示词(已更新).txt')
    fs.writeFileSync(file, 'x', 'utf8')
    const entry = { file: '02_剧本改编/01_改文提示词（第一人称+钩子+精简）.txt', legacy: '改文提示词(已更新).txt' }
    assert.equal(resolveFile({ libraryRoot: root }, entry), file)
  })

  it('returns empty when the library root is not configured', () => {
    assert.equal(resolveFile({ libraryRoot: '' }, { file: 'a.txt' }), '')
  })
})

describe('voice search', () => {
  const index = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'library', 'voice-index.json')
  const hasIndex = fs.existsSync(index)

  it('searches by keyword', { skip: !hasIndex && 'voice-index.json not built' }, () => {
    const result = searchVoices({ voiceIndexPath: index, voicesRoot: 'X' }, { query: '逗', limit: 5 })
    assert.ok(result.total > 0)
    assert.ok(result.shown.length <= 5)
  })

  it('filters by category', { skip: !hasIndex && 'voice-index.json not built' }, () => {
    const result = searchVoices({ voiceIndexPath: index, voicesRoot: 'X' }, { category: '智声整理音色', limit: 3 })
    assert.ok(result.total > 0)
    assert.ok(result.shown.every((item) => item.category === '智声整理音色'))
  })
})
