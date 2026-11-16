import fs from 'node:fs'
import path from 'node:path'

export const CARD_SPECS = {
  character: { dir: '03_角色设定', prefix: 'C', label: '角色卡' },
  scene: { dir: '04_场景设定', prefix: 'S', label: '场景卡' },
  prop: { dir: '05_道具设定', prefix: 'P', label: '道具卡' },
}

const SCENE_DYNAMIC = [
  '开启', '喷涌', '飞舞', '飘动', '流转', '升腾', '闪烁', '涌动', '炸开',
  '燃烧', '跳动', '游走', '明灭不定', '爆炸', '旋转', '推开', '裂开', '扩散',
]

/**
 * Validate a card body against the consistency rules that keep faces and
 * scenes stable across shots. Returns human-readable errors and warnings.
 */
export function checkCardBody(kind, body) {
  const text = String(body || '')
  const errors = []
  const warnings = []

  if (text.trim().length < 40) warnings.push('内容过少（<40 字），生图时容易跑偏')

  if (kind === 'character') {
    if (/手持|握着|拿着|手中|手持物品/.test(text)) {
      errors.push('人物卡出现手持物品：改为"双手自然垂落"，道具另建道具卡')
    }
    if (/(灵光|佛光|妖气|光晕|光环|符文|法阵)/.test(text)) {
      errors.push('人物卡出现特效：人物只做"干净素模人设"，特效留到分镜/后期')
    }
    if (/(瞳孔|虹膜)[^，。；\n]{0,8}(色|黑|蓝|金|红|紫|灰|褐)/.test(text)) {
      errors.push('出现瞳孔颜色/虹膜细节：只写"目光深邃/沉稳"，越具体越容易崩')
    }
    if (!/整体形态/.test(text)) errors.push('缺「整体形态」（身形比例、体态气场、线条、服饰连贯性）——优先级最高')
    if (!/头部/.test(text)) errors.push('缺「头部」（脸型、五官、发型、眉形、眼部）')
    if (!/上身/.test(text)) warnings.push('缺「上身」描述')
    if (!/下身/.test(text)) warnings.push('缺「下身」描述（一笔带过即可）')
    if (!/构图标签/.test(text)) warnings.push('缺 [构图标签]，生图时补上四视图/定妆照参数')
    if (!/风格标签/.test(text)) warnings.push('缺 [风格标签]，全集风格必须统一')
  }

  if (kind === 'scene') {
    const hits = SCENE_DYNAMIC.filter((word) => text.includes(word))
    if (hits.length > 0) errors.push(`场景卡出现动态词：${hits.join('、')}（动态特效一律留到后期）`)
    if (/有人|人物|人影|剪影/.test(text)) errors.push('场景卡不得出现人物（含剪影）')
    if (!/光线氛围/.test(text)) warnings.push('缺「光线氛围」（只允许柔和静态光）')
    if (!/远景层次/.test(text)) warnings.push('缺「远景层次」（隐约可见/若有若无）')
    if (!/构图标签/.test(text)) warnings.push('缺 [构图标签]（16:9 无人纯场景）')
  }

  if (kind === 'prop') {
    if (!/材质/.test(text)) warnings.push('缺「材质」')
    if (!/用途|功能/.test(text)) warnings.push('缺「用途」')
    if (/血迹|破损|断裂|残缺/.test(text)) errors.push('道具只保留正常状态：删掉血迹/破损/战斗痕迹')
  }

  return { errors, warnings }
}

export function buildCardMarkdown(kind, { id, name, body }) {
  const spec = CARD_SPECS[kind]
  const title = `${spec.label} · ${id}_${name}`
  const text = String(body || '').trim()
  const hint = /构图标签/.test(text)
    ? ''
    : '\n\n> 提示：本卡缺 `[构图标签]` / `[风格标签]`，生图前按同目录 `_角色卡模板.md` 或 `_场景卡模板.md` 补上。\n'
  return `# ${title}\n\n${text}\n${hint}`
}

export function nextId(projectDir, kind) {
  const spec = CARD_SPECS[kind]
  const dir = path.join(projectDir, spec.dir)
  let max = 0
  try {
    for (const name of fs.readdirSync(dir)) {
      const match = name.match(new RegExp(`^${spec.prefix}(\\d{2})_`))
      if (match) max = Math.max(max, Number(match[1]))
    }
  } catch {
    return `${spec.prefix}01`
  }
  return `${spec.prefix}${String(max + 1).padStart(2, '0')}`
}

export function listCards(projectDir, kind) {
  const spec = CARD_SPECS[kind]
  const dir = path.join(projectDir, spec.dir)
  let names = []
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.md') && !n.startsWith('_'))
  } catch {
    return []
  }
  return names.sort().map((name) => ({
    name,
    rel: `${spec.dir}/${name}`,
    chars: fs.statSync(path.join(dir, name)).size,
  }))
}

function safeFilePart(text) {
  return String(text).replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名'
}

export function writeCard(projectDir, kind, { id, name, body }) {
  const spec = CARD_SPECS[kind]
  const dir = path.join(projectDir, spec.dir)
  fs.mkdirSync(dir, { recursive: true })
  const file = `${safeFilePart(id)}_${safeFilePart(name)}.md`
  const target = path.join(dir, file)
  fs.writeFileSync(target, buildCardMarkdown(kind, { id, name, body }), 'utf8')
  return { path: target, rel: `${spec.dir}/${file}` }
}
