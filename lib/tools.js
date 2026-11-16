import fs from 'node:fs'
import path from 'node:path'

import { defineTool } from '@deepseek-ai/dsh-tools'

import { describePaths, resolveProject, PROJECT_DIRS } from './config.js'
import { checkCardBody, listCards, nextId, writeCard } from './cards.js'
import { MANUAL_TOPICS, scanCompliance } from './compliance.js'
import { getEntry, loadIndex, promptPath, readPrompt, searchEntries } from './library.js'
import { initProject, nextPending, projectStatus } from './projects.js'
import { findStep, STEPS } from './steps.js'
import { checkStoryboard, formatStoryboardReport, VOICE_TAGS } from './storyboard.js'
import { searchVoices } from './voices.js'

const OUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
}

function readTarget(projectDir, target) {
  const candidates = path.isAbsolute(target)
    ? [target]
    : [path.join(projectDir, target), path.resolve(process.cwd(), target)]
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return { file: candidate, text: fs.readFileSync(candidate, 'utf8') }
    } catch {
      /* try next */
    }
  }
  return null
}

function modeLabel(mode) {
  if (mode === 'agent') return '我来做（本会话内完成）'
  if (mode === 'manual') return '你来操作（需要账号/出图工具）'
  return '混合：我出材料，你来执行'
}

function playbook(cfg, step, projectDir) {
  const entry = step.promptId ? getEntry(cfg, step.promptId) : null
  const lines = []

  lines.push(`## 步骤 ${step.n} · ${step.title}`)
  lines.push('')
  lines.push(`**分工**：${modeLabel(step.mode)}`)
  lines.push(`**目标**：${step.goal}`)
  lines.push('')

  if (step.agent.length > 0) {
    lines.push('### 我做什么')
    step.agent.forEach((item, index) => lines.push(`${index + 1}. ${item}`))
    lines.push('')
  }

  if (step.manual.length > 0) {
    lines.push('### 你做什么（照这个顺序点）')
    step.manual.forEach((item, index) => {
      lines.push(`${index + 1}. **${item.tool}** → ${item.where}：${item.action}`)
    })
    lines.push('')
  }

  if (entry) {
    const file = promptPath(cfg, entry)
    lines.push('### 用哪份提示词')
    lines.push(`- id：\`${entry.id}\` · ${entry.title}`)
    lines.push(`- 粘贴到：${entry.pasteInto}`)
    lines.push(`- 文件：${file || '（未配置提示词库，见 manju_prompt 的说明）'}`)
    if (Array.isArray(entry.sections)) {
      for (const section of entry.sections) {
        const range = section.to ? `第 ${section.from}–${section.to} 行` : `第 ${section.from} 行至末尾`
        lines.push(`  - ${range}：${section.label}`)
      }
    }
    if (step.promptId === 'storyboard-15s') {
      lines.push('- 题材叠加：仙侠加 `patch-xianxia`，探案加 `patch-suspense`（追加在母版之后，不替换）')
    }
    lines.push('')
  }

  lines.push('### 产出（存到）')
  for (const output of step.outputs) lines.push(`- \`${output}\``)
  lines.push('')
  lines.push('### 通过标准')
  for (const item of step.accept) lines.push(`- [ ] ${item}`)
  lines.push('')

  const extra = []
  if (step.n === 2) {
    extra.push('⚠️ `rewrite` 一个文件里有两套指令：**只贴第 1–26 行**做改文，别整份投喂。')
  }
  if (step.n === 3) {
    extra.push('⚠️ 同一份文件从第 27 行起是剧本转换规则，这一步才用后半段。')
  }
  if (step.n === 5) {
    extra.push('推荐值：仙侠/玄幻打斗 → `3D古风玄幻国漫`；古风言情权谋 → `新三维国风`；都市豪门 → `商业摄影写实` 或 `电影质感写实`；悬疑 → `暗黑悬疑风`。')
  }
  if (step.n === 7) {
    extra.push('三视图顺序不能乱：先出单张正面照并保存 → 再把这张图 + 三视图指令一起投给即梦。只发文字会得到"另一个角色"。')
    extra.push('三视图自检：正/侧/背是同一张脸、服装长度对应、图内无文字水印。')
  }
  if (step.n === 8) {
    extra.push(`音色只能用母版 9 个标签：${VOICE_TAGS.join('、')}。`)
    extra.push('每次只要 10 个分镜；一版出来后用 `manju_check(kind=storyboard)` 自检，改到 0 错误再进下一步。')
  }
  if (step.n === 10) {
    extra.push('画质括号固定加：（使用中文对话，无字幕，自动配音，画面禁止出现任何文字，无背景音乐，完美的手，丝滑连贯的动作，允许自行优化镜头画面）')
  }
  if (projectDir) {
    extra.push(`当前项目：\`${projectDir}\``)
  }
  if (extra.length > 0) {
    lines.push('### 注意')
    for (const item of extra) lines.push(`- ${item}`)
    lines.push('')
  }

  return lines.join('\n')
}

export function buildTools(cfg) {
  const initProjectTool = defineTool({
    name: 'manju_init_project',
    description:
      'Create one episode workspace for the AI short-drama pipeline: 13 stage folders plus card, storyboard, dialogue and publishing templates. Use it before any other manju_* tool when starting an episode.',
    parameters: {
      name: { type: 'string', required: true, description: 'Drama title, used in the folder name and templates' },
      episode: { type: 'number', description: 'Episode number, defaults to 1' },
      root: { type: 'string', description: 'Parent folder; defaults to the configured projects root' },
    },
    output: OUT,
    execute(args) {
      const result = initProject(cfg, { name: args.name, episode: args.episode ?? 1, root: args.root })
      if (result.existing) {
        return `项目已存在，未覆盖：\n${result.dir}\n\n先做 \`manju_status\` 看进度，或用 \`manju_init_project\` 换一个集数。`
      }
      return [
        `已创建项目：${result.dir}`,
        `模板文件 ${result.written.length} 个：${result.written.join('、')}`,
        '',
        '下一步：先填 `00_项目说明.md` 的题材与作品形态，再执行 `manju_step` step=1。',
      ].join('\n')
    },
  })

  const statusTool = defineTool({
    name: 'manju_status',
    description:
      'Report which pipeline stages already have artifacts in an episode project and which stage to do next. Use it when resuming work or when the user asks what is left.',
    parameters: {
      project: { type: 'string', description: 'Project folder or name under the projects root; defaults to the working directory' },
    },
    output: OUT,
    execute(args) {
      const dir = resolveProject(cfg, args.project)
      if (!fs.existsSync(dir)) return `找不到项目目录：${dir}`
      if (!fs.existsSync(path.join(dir, '00_项目说明.md'))) {
        return [
          `这个目录不是一个漫剧项目：${dir}`,
          '',
          '先用 `manju_init_project` 建一集，或把 project 参数指向 `06_项目/YYYYMMDD_剧名_EP01`。',
          '',
          '当前路径解析：',
          describePaths(cfg),
        ].join('\n')
      }
      const status = projectStatus(cfg, dir)
      const next = nextPending(status)
      const lines = [`## 项目进度`, ``, `目录：${dir}`, ``]
      for (const row of status.rows) {
        const mark = row.done ? '✅' : '⬜'
        lines.push(`${mark} 步骤 ${row.step} · ${row.label}${row.count ? `（${row.count} 个产出）` : ''}`)
      }
      lines.push('')
      lines.push(`风格锁定：${status.styleLocked ? `已锁定 → ${status.style}` : '未锁定（步骤 5）'}`)
      lines.push('')
      lines.push(
        next > 12
          ? '全部阶段都有产出。下一步：过 `manju_check(kind=compliance)` 与发布清单，然后发布。'
          : `下一步：\`manju_step\` step=${next}`,
      )
      return lines.join('\n')
    },
  })

  const stepTool = defineTool({
    name: 'manju_step',
    description:
      'Return the operating playbook for one pipeline stage: what the assistant does, what the human must do in which app, which prompt file to paste where, where the output goes, and the acceptance checks. Use it to drive the workflow step by step.',
    parameters: {
      step: { type: 'string', required: true, description: 'Stage number 0-12 or its id, e.g. 8 or storyboard' },
      project: { type: 'string', description: 'Project folder used only to echo the working path' },
    },
    output: OUT,
    execute(args) {
      const step = findStep(args.step)
      if (!step) {
        return `没有这个阶段：${args.step}\n可用：${STEPS.map((s) => `${s.n}=${s.id}`).join('，')}`
      }
      const dir = args.project ? resolveProject(cfg, args.project) : ''
      return playbook(cfg, step, dir)
    },
  })

  const promptTool = defineTool({
    name: 'manju_prompt',
    description:
      "Look up a prompt from the user's own prompt library: by id returns its file path, paste target, line sections and a bounded preview; with a query it searches; with no argument it lists every prompt by stage.",
    parameters: {
      id: { type: 'string', description: 'Prompt id, e.g. storyboard-15s' },
      query: { type: 'string', description: 'Free-text search over id, title, tags, tool and paste target' },
      from: { type: 'number', description: 'First line of the preview, 1-based' },
      to: { type: 'number', description: 'Last line of the preview' },
    },
    output: OUT,
    execute(args) {
      if (!cfg.libraryRoot) {
        return [
          '提示词库未配置：没在你机器上找到 `01_提示词库`。',
          '',
          '当前路径解析：',
          describePaths(cfg),
          '',
          '三种修法（任选其一，改完重启 DSH 生效）：',
          `1. 写配置文件 ${cfg.homeConfigPath}：\n   {"libraryRoot": "F:\\\\...\\\\01_提示词库"}`,
          '2. 设环境变量 `MANJU_LIBRARY_ROOT`',
          '3. 在插件行的 config 里写 `libraryRoot`（cordis.patch.yml 的 patch 层）',
        ].join('\n')
      }

      if (args.id) {
        const entry = getEntry(cfg, args.id)
        if (!entry) {
          const guesses = searchEntries(cfg, args.id).slice(0, 5)
          return `没有 id 为 \`${args.id}\` 的提示词。${guesses.length ? `相近：${guesses.map((g) => g.id).join('，')}` : '用 manju_prompt 不带参数看全部。'}`
        }
        const file = promptPath(cfg, entry)
        const lines = [
          `## ${entry.id} · ${entry.title}`,
          '',
          `- 阶段：${entry.step}`,
          `- 工具：${entry.tool}`,
          `- 粘贴到：${entry.pasteInto}`,
          `- 文件：${file || '（库目录下没找到这个文件）'}`,
        ]
        if (Array.isArray(entry.sections)) {
          for (const section of entry.sections) {
            lines.push(`  - ${section.to ? `第 ${section.from}–${section.to} 行` : `第 ${section.from} 行至末尾`}：${section.label}`)
          }
        }
        const info = readPrompt(cfg, entry, { from: args.from, to: args.to, maxChars: 900 })
        if (info.ok) {
          lines.push(`- 总行数：${info.totalLines}，总字符：${info.totalChars}`)
          lines.push('', '### 预览（前 900 字符）', '```text', info.preview, '```')
        } else {
          lines.push(`- 读取失败：${info.reason}`)
        }
        return lines.join('\n')
      }

      if (args.query) {
        const hits = searchEntries(cfg, args.query)
        if (hits.length === 0) return `没有匹配「${args.query}」的提示词。`
        return [`## 匹配「${args.query}」：${hits.length} 条`, '', ...hits.map((e) => `- \`${e.id}\`（阶段 ${e.step}）${e.title}`)].join('\n')
      }

      const all = loadIndex(cfg)
      const lines = ['## 提示词库（按阶段）', '']
      for (const step of STEPS) {
        const items = all.filter((e) => e.step === step.n)
        if (items.length === 0) continue
        lines.push(`**步骤 ${step.n} · ${step.title}**`)
        for (const item of items) lines.push(`- \`${item.id}\`：${item.title}`)
        lines.push('')
      }
      return lines.join('\n')
    },
  })

  const checkTool = defineTool({
    name: 'manju_check',
    description:
      'Validate pipeline material. kind=compliance scans Chinese short-drama banned words by line; kind=storyboard checks the 15-second storyboard format (timeline coverage, voice tags, transition block, closing state card); kind=card validates one character/scene/prop card. Pass text or a path.',
    parameters: {
      kind: { type: 'string', required: true, description: 'compliance | storyboard | card' },
      text: { type: 'string', description: 'Raw text to check' },
      path: { type: 'string', description: 'File to check, relative to the project or absolute' },
      project: { type: 'string', description: 'Project folder used to resolve relative paths' },
      cardKind: { type: 'string', description: 'For kind=card: character | scene | prop' },
    },
    output: OUT,
    execute(args) {
      const kind = String(args.kind || '').toLowerCase()
      let text = args.text || ''
      let label = '（内联文本）'
      if (!text && args.path) {
        const dir = args.project ? resolveProject(cfg, args.project) : process.cwd()
        const found = readTarget(dir, args.path)
        if (!found) return `读不到文件：${args.path}`
        text = found.text
        label = found.file
      }
      if (!text) return '没有内容可检查：传 text 或 path。'

      if (kind === 'compliance') {
        const result = scanCompliance(text)
        const lines = [`## 合规扫描：${label}`, '']
        if (result.total === 0) {
          lines.push('没有命中违禁词。仍需人工确认选题级红线：')
          for (const topic of MANUAL_TOPICS) lines.push(`- [ ] ${topic}`)
          return lines.join('\n')
        }
        lines.push(`命中 ${result.total} 处${result.truncated ? `（列出前 ${result.shown} 处）` : ''}：`)
        for (const item of result.counts) lines.push(`- ${item.category}：${item.count}`)
        lines.push('', '| 行 | 词 | 类别 | 改法 |', '|---|---|---|---|')
        for (const hit of result.hits) lines.push(`| ${hit.line} | ${hit.word} | ${hit.category} | ${hit.hint} |`)
        lines.push('', '改完再扫一次；题材级红线（真实机构、涉黑、未成年人恋爱等）仍需人工判断。')
        return lines.join('\n')
      }

      if (kind === 'storyboard') {
        const result = checkStoryboard(text)
        return formatStoryboardReport(result, label)
      }

      if (kind === 'card') {
        const cardKind = String(args.cardKind || '').toLowerCase()
        if (!['character', 'scene', 'prop'].includes(cardKind)) {
          return 'kind=card 需要再给 cardKind：character | scene | prop'
        }
        const result = checkCardBody(cardKind, text)
        const lines = [`## 卡片校验（${cardKind}）：${label}`, '']
        if (result.errors.length === 0 && result.warnings.length === 0) return lines.concat('全部通过。').join('\n')
        for (const error of result.errors) lines.push(`- ❌ ${error}`)
        for (const warning of result.warnings) lines.push(`- ⚠️ ${warning}`)
        return lines.join('\n')
      }

      return `不认识的 kind：${kind}（可用 compliance / storyboard / card）`
    },
  })

  const cardTool = defineTool({
    name: 'manju_card',
    description:
      'Create, list or validate the reusable asset cards of an episode: character (C), scene (S) and prop (P). Creating a card validates the consistency rules first and refuses nothing, but reports every violation so it can be fixed.',
    parameters: {
      kind: { type: 'string', required: true, description: 'character | scene | prop' },
      action: { type: 'string', description: 'create (default) | list | validate' },
      name: { type: 'string', description: 'Card name, e.g. 苏墨' },
      id: { type: 'string', description: 'Card id; auto-numbered as C01/S01/P01 when omitted' },
      body: { type: 'string', description: 'Card body: the structured description with composition and style tags' },
      project: { type: 'string', description: 'Project folder; defaults to the working directory' },
    },
    output: OUT,
    execute(args) {
      const kind = String(args.kind || '').toLowerCase()
      if (!['character', 'scene', 'prop'].includes(kind)) {
        return 'kind 只能是 character / scene / prop'
      }
      const dir = resolveProject(cfg, args.project)
      const action = String(args.action || 'create').toLowerCase()

      if (action === 'list') {
        const cards = listCards(dir, kind)
        if (cards.length === 0) return `${dir} 下还没有 ${kind} 卡片。`
        return [`## ${kind} 卡片（${cards.length}）`, '', ...cards.map((c) => `- \`${c.rel}\``)].join('\n')
      }

      const body = String(args.body || '')
      if (!body.trim()) return '需要 body：把结构化描述贴进来（含 [构图标签] 与 [风格标签]）。'

      const check = checkCardBody(kind, body)
      const report = []
      for (const error of check.errors) report.push(`❌ ${error}`)
      for (const warning of check.warnings) report.push(`⚠️ ${warning}`)

      if (action === 'validate') {
        return report.length > 0 ? ['校验结果：', '', ...report].join('\n') : '校验通过。'
      }

      const name = String(args.name || '').trim() || '未命名'
      const id = String(args.id || '').trim() || nextId(dir, kind)
      const written = writeCard(dir, kind, { id, name, body })
      return [
        `已写入：${written.rel}`,
        `绝对路径：${written.path}`,
        '',
        report.length > 0 ? ['校验提示（建议先修再出图）：', ...report].join('\n') : '校验通过：无违规项。',
      ].join('\n')
    },
  })

  const voicesTool = defineTool({
    name: 'manju_voices',
    description:
      "Search the local voice-clone index by keyword or category and return matching audio file names with their folders. Use it when casting a role before TTS cloning.",
    parameters: {
      query: { type: 'string', description: 'Keyword over file name, folder and category, e.g. 御姐 or 方言' },
      category: { type: 'string', description: 'Top-level folder, e.g. 克隆参考音色 | 智声整理音色 | 逗哥音色整理合集' },
      limit: { type: 'number', description: 'How many matches to return, 1-100, default 20' },
    },
    output: OUT,
    execute(args) {
      const result = searchVoices(cfg, args)
      const lines = [`## 音色检索`, '']
      lines.push(`匹配 ${result.total} 个${result.libraryRoot ? `，音频目录：${result.libraryRoot}` : ''}`)
      lines.push(
        result.masked
          ? '索引：仓库里的**脱敏版**（真实人名已换成拼音首字母）。想用真实文件名，本机跑 `npm run build:voices` 生成完整版。'
          : `索引：本地完整版（${result.indexFile}）。`,
      )
      lines.push('')
      if (result.shown.length > 0) {
        lines.push('| 名称 | 类别 | 子类 | 格式 |', '|---|---|---|---|')
        for (const item of result.shown) {
          lines.push(`| ${item.name} | ${item.category} | ${item.group || '—'} | ${item.format || ''} |`)
        }
        lines.push('')
      }
      lines.push('分类分布（前 10）：')
      for (const item of result.categories.slice(0, 10)) lines.push(`- ${item.key}：${item.count}`)
      return lines.join('\n')
    },
  })

  return [initProjectTool, statusTool, stepTool, promptTool, checkTool, cardTool, voicesTool]
}

export { PROJECT_DIRS }
