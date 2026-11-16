/** Validation for the 15-second storyboard format (母版). */

const HEADER = /^###\s*分镜\s*(\d+)\s*$/gm
const SEGMENT = /\[\s*(\d+(?:\.\d+)?)\s*[-–—~]\s*(\d+(?:\.\d+)?)\s*秒\s*\]/g
const TONE = /（[^）]*音色[:：][^）]*）/
const EPS = 0.011

export const STATUS_KEYS = [
  '分镜编号',
  '总时长',
  '资产变更状态',
  '空间锚点（终态）',
  '角色站位（终态）',
  '光影状态（终态）',
  '道具状态（终态）',
  '情绪基线（终态）',
  '衔接方式',
  '衔接容差',
]

export const VOICE_TAGS = [
  '沉稳中年', '清朗少年', '温柔少女', '反派阴冷', '御姐成熟',
  '热血青年', '苍老沙哑', '机械合成', '童真稚嫩',
]

function splitBlocks(text) {
  const matches = [...text.matchAll(HEADER)]
  return matches.map((m, i) => {
    const start = m.index
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    return { number: Number(m[1]), text: text.slice(start, end), offset: start }
  })
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

/**
 * @param {string} text
 * @param {{ expectedSeconds?: number }} [opts]
 */
export function checkStoryboard(text, opts = {}) {
  const expected = opts.expectedSeconds ?? 15
  const blocks = splitBlocks(text)
  const issues = []

  if (blocks.length === 0) {
    return {
      blocks: 0,
      issues: [{ block: null, level: 'error', message: '没有找到 `### 分镜N` 标题，格式与母版不一致' }],
      summary: '0 个分镜',
    }
  }

  blocks.forEach((block, index) => {
    const n = block.number
    const push = (level, message) => issues.push({ block: n, level, message })

    if (n !== index + 1) push('error', `编号不连续：第 ${index + 1} 段标成了分镜${n}`)

    // 1. 时间轴
    const segments = [...block.text.matchAll(SEGMENT)]
      .map((m) => ({ start: Number(m[1]), end: Number(m[2]) }))
      .sort((a, b) => a.start - b.start)

    if (segments.length === 0) {
      push('error', '没有找到 `[起-止秒]` 时间分段')
    } else {
      let cursor = 0
      for (const seg of segments) {
        if (seg.end <= seg.start) push('error', `时间段 ${seg.start}-${seg.end} 秒区间非法`)
        if (seg.start > cursor + EPS) push('error', `${cursor} → ${seg.start} 秒之间有空档`)
        if (seg.start < cursor - EPS) push('error', `${seg.start} 秒处与上一段重叠`)
        cursor = Math.max(cursor, seg.end)
      }
      if (Math.abs(cursor - expected) > EPS) {
        push('error', `总时长 ${cursor} 秒，母版要求 ${expected} 秒`)
      }
    }

    // 2. 音色标注
    const dialogueLines = block.text
      .split('\n')
      .filter((line) => line.includes('台词') && !line.includes('[无台词]'))
    for (const line of dialogueLines) {
      if (!TONE.test(line)) {
        push('warn', `台词缺音色标注（角色名，情绪，音色：标签）：${line.trim().slice(0, 60)}`)
        continue
      }
      const tag = line.match(/音色[:：]\s*([^）]+)/)?.[1]?.trim()
      if (tag && !VOICE_TAGS.includes(tag)) {
        push('warn', `音色标签「${tag}」不在母版 9 个预制标签内，确认是全片固定值`)
      }
    }

    // 3. 衔接声明（分镜 2 起必填）
    if (n >= 2 && !block.text.includes('【衔接上一镜画面和人物站位统一】')) {
      push('error', '分镜 2 起必须输出【衔接上一镜画面和人物站位统一】')
    }

    // 4. plaintext 包裹
    if (!block.text.includes('```plaintext')) {
      push('warn', '没有 plaintext 代码块：衔接声明 + 镜头1 + 镜头2 应包在块内')
    }

    // 5. 状态卡
    if (!block.text.includes('【片段结尾状态卡】')) {
      push('error', '缺【片段结尾状态卡】')
    } else {
      for (const key of STATUS_KEYS) {
        if (!block.text.includes(key)) push('error', `状态卡缺字段：${key}`)
      }
      // 母版的五项容差写成 ≤2% / ≥95% / ≤5% / ≤2% / ≤10°，比较符两种方向都要算
      const tolerances = (block.text.match(/[≤≥]\s*\d+(?:\.\d+)?\s*(?:%|°)/g) || []).length
      if (tolerances < 5) push('warn', `衔接容差只列了 ${tolerances} 项，母版要求 5 项`)
    }
  })

  const errors = issues.filter((i) => i.level === 'error').length
  const warns = issues.length - errors
  return {
    blocks: blocks.length,
    issues,
    summary: `${blocks.length} 个分镜，${errors} 个错误，${warns} 个警告`,
  }
}

export function formatStoryboardReport(result, fileLabel) {
  const lines = [`### 分镜自检：${fileLabel ?? ''}`.trim(), result.summary, '']
  if (result.issues.length === 0) {
    lines.push('全部通过：时间轴、音色、衔接声明、状态卡字段均符合母版。')
    return lines.join('\n')
  }
  for (const issue of result.issues) {
    const where = issue.block === null ? '（文件级）' : `分镜${issue.block}`
    lines.push(`- ${issue.level === 'error' ? '❌' : '⚠️'} ${where}：${issue.message}`)
  }
  lines.push('', '修法：时间轴按 0-4 / 4-8 / 8-12 / 12-15 四段补齐；状态卡取 `[12-15秒]` 的实际描述；分镜 2 起补衔接声明。')
  return lines.join('\n')
}
