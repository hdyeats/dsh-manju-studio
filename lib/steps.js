/**
 * The twelve workstations of the pipeline.
 *
 * `mode` tells who does the work:
 *   agent  — the model can finish it in this session (text in, text out)
 *   manual — a human must operate an image/video/audio app or an account
 *   mixed  — the model prepares the material, the human runs the generator
 */

export const STEPS = [
  {
    n: 0,
    id: 'init',
    title: '建项目',
    mode: 'agent',
    goal: '建出本集的目录骨架与模板文件。',
    agent: ['调用 manju_init_project（剧名 / 集数），得到项目目录与模板清单'],
    manual: [],
    outputs: ['<项目>/00_项目说明.md', '<项目>/01_原作 … 11_封面与发布'],
    accept: ['目录齐全', '00_项目说明.md 可填写'],
  },
  {
    n: 1,
    id: 'triage',
    title: '小说体检 + 分集',
    mode: 'agent',
    goal: '在加工前先排除合规红线，并把长篇小说切成 2–3 分钟一集。',
    agent: [
      '用 manju_check(kind=compliance) 扫小说全文，输出命中词与行号',
      '按"每集 2–3 分钟、结尾留钩子"给出分集表（集号 / 起止句 / 核心事件 / 钩子 / 台词字数 / 预估时长）',
      '给出 EP01 的 3 个候选开场（前 3 句内必须抛悬念或反转）',
      '把结论写入 01_原作/00_合规体检与分集.md',
    ],
    manual: [],
    outputs: ['01_原作/00_合规体检与分集.md'],
    accept: ['无一票否决项（政治/黑恶/色情/封建迷信/未成年人）', '每集 1200–2000 字原文', '每集结尾有钩子'],
  },
  {
    n: 2,
    id: 'rewrite',
    title: '改文（第一人称精简稿）',
    mode: 'agent',
    goal: '把小说改成第一人称、前 3 句带钩子、约原文 50–60% 的精简稿。',
    agent: [
      '取 library 里 rewrite 提示词的**前 26 行**作为规则（该文件后半是剧本转换规则，不能一起用）',
      '按规则改写本集原文：统一第一人称、删铺垫、说明文转动作/神态/道具/对话、不许留旁白',
      '单句台词 ≤15 字；目标字数 = 本集原文 × 0.55',
    ],
    manual: [],
    promptId: 'rewrite',
    outputs: ['02_剧本/01_改文定稿.md'],
    accept: ['抽 3 段无需旁白即可看懂', '开场 3 句有钩子', '无"他想/他意识到"类心理描写'],
  },
  {
    n: 3,
    id: 'screenplay',
    title: '剧本化（动作/对话/时长）',
    mode: 'agent',
    goal: '把精简稿拆成可拍的动作块与对话块，并标时长。',
    agent: [
      '取 rewrite 提示词的**第 27 行至末尾**（动作/对话判断规则、镜头表、时长表）',
      '把精简稿转成 `【镜头：类型】动作/对话 + （时长 Xs）` 块，动作与对话交替',
      '总时长控制在 90 秒左右，单句台词 ≤5 秒',
    ],
    manual: [],
    promptId: 'rewrite',
    outputs: ['02_剧本/03_剧本块.md'],
    accept: ['无"旁白/字幕/画外音"', '无连续 5 秒以上纯对话', '每块都有时长'],
  },
  {
    n: 4,
    id: 'scenes',
    title: '分场表',
    mode: 'agent',
    goal: '把剧本块归并成场，算出每场需要几个 15 秒分镜。',
    agent: [
      '按场景归并，统一场景命名（同一场景不得出现两个名字）',
      '算 15 秒分镜数 = 台词字数 ÷ 80，向上取整',
      '场景总数控制在 5 个以内（场景越多资产图越多）',
    ],
    manual: [],
    outputs: ['02_剧本/02_分场表.md'],
    accept: ['场景名唯一', '分镜数合计与台词字数一致', '场景数 ≤5'],
  },
  {
    n: 5,
    id: 'style',
    title: '锁风格',
    mode: 'agent',
    goal: '选定一个风格名，全片不再更换。',
    agent: [
      '按题材推荐 1 个风格并说明理由（仙侠→3D古风玄幻国漫；古风言情→新三维国风；都市/豪门→商业摄影写实或电影质感写实；悬疑→暗黑悬疑风）',
      '写入 00_项目说明.md 的「锁定风格」',
    ],
    manual: [],
    outputs: ['00_项目说明.md'],
    accept: ['风格名唯一且具体', '与出图工具匹配（3D 走即梦，仿真人可走豆包或即梦）'],
  },
  {
    n: 6,
    id: 'assets',
    title: '资产提取（角色/场景/道具）',
    mode: 'mixed',
    goal: '产出可复用的角色卡、场景卡、道具卡。',
    agent: [
      '按作品形态选提示词：仿真人→extract-fake-doubao 或 extract-s-grade-character + extract-s-grade-scene；3D 漫→extract-3d-jimeng',
      '用提示词把本集剧本块转成结构化描述',
      '逐条用 manju_card 落盘为 C01/S01/P01 卡片',
    ],
    manual: [{ tool: '即梦 / 豆包', where: '对话窗口', action: '把提示词与本集剧本一起投喂，复制输出' }],
    promptId: 'extract-3d-jimeng',
    outputs: ['03_角色设定/C0X_*.md', '04_场景设定/S0X_*.md', '05_道具设定/P0X_*.md'],
    accept: ['人物卡无道具/无特效/无瞳孔细节', '场景卡无动态词、无人物', '每人只保留一套服装'],
  },
  {
    n: 7,
    id: 'asset-images',
    title: '三视图 / 四视图',
    mode: 'manual',
    goal: '把卡片变成可复用的参考图（锁脸的物理依据）。',
    agent: ['生成可直接粘贴的三视图/四视图/站位指令（来自 library 的 supplement 指令集）'],
    manual: [
      { tool: '即梦', where: '图片生成', action: '先出单张正面照并保存' },
      { tool: '即梦', where: '图生图（上传正面照）', action: '加三视图指令，出 大头贴+正/侧/背' },
      { tool: '即梦', where: '图生图（上传场景图）', action: '加四视图指令，出 2×2 场景' },
    ],
    outputs: ['07_首帧图/00_资产/角色/C0X_*_三视图.png', '07_首帧图/00_资产/场景/S0X_*.png'],
    accept: ['正/侧/背是同一张脸且服装长度对应', '图内无文字水印', '场景图无人、无强光效'],
  },
  {
    n: 8,
    id: 'storyboard',
    title: '分镜（15 秒/段）',
    mode: 'agent',
    goal: '产出带衔接声明、时间轴、音色标注、结尾状态卡的分镜脚本。',
    agent: [
      '取 storyboard-15s 母版作为规则；仙侠叠 patch-xianxia，探案叠 patch-suspense',
      '输入本场文案 + 资产清单（C/S/P 编号）+ 音色表',
      '每 10 个分镜一版输出；用 manju_check(kind=storyboard) 自检并修到通过',
    ],
    manual: [],
    promptId: 'storyboard-15s',
    outputs: ['06_分镜/EPxx_Sxx_分镜.md'],
    accept: ['0–15 秒无空档无重叠', '带台词镜头都有（角色，情绪，音色：标签）', '状态卡与 [12-15秒] 一致', '编号连续'],
  },
  {
    n: 9,
    id: 'first-frame',
    title: '首帧图',
    mode: 'mixed',
    goal: '每镜一张首帧，站位与分镜的绝对方位一致。',
    agent: ['按分镜写出站位合成指令（场景图 + 人物图 + 红绿框位置 + 表情微描述）'],
    manual: [{ tool: '即梦', where: '图生图 / 合成', action: '三张图 + 站位指令出图，成图不许留红绿框' }],
    outputs: ['07_首帧图/01_场镜/EPxx_Sxx-xx.png'],
    accept: ['无红绿框、无文字', '朝向与分镜一致', '手部完整'],
  },
  {
    n: 10,
    id: 'video',
    title: '图生视频',
    mode: 'manual',
    goal: '每镜一段 15 秒视频。',
    agent: ['给出该镜可直接粘贴的 video_prompt 与画质括号', '翻车时按 fix-four-failures 给出改写'],
    manual: [
      { tool: '豆包 / 即梦 / Seedance / 可灵', where: '图生视频', action: '上传首帧 + 粘贴 video_prompt + 画质括号' },
      { tool: '同上', where: '重试', action: '飞太慢/人太大/被切镜/打斗不疼 各有固定改法' },
    ],
    promptId: 'fix-four-failures',
    outputs: ['08_视频片段/EPxx_Sxx-xx.mp4'],
    accept: ['无文字字幕水印', '不换脸不换造型', '与上一镜状态卡对得上'],
  },
  {
    n: 11,
    id: 'voice',
    title: '配音',
    mode: 'mixed',
    goal: '按台词表出各角色音轨，全片音色固定。',
    agent: ['用 manju_voices 选音色', '整理台词表 CSV（镜号/角色/情绪/音色标签/台词/时长）'],
    manual: [
      { tool: 'TTS2', where: '克隆', action: '上传参考音频 + 台词文本' },
      { tool: '创作猫', where: '手机配音', action: '快速试音' },
    ],
    outputs: ['09_配音/台词表.csv', '09_配音/*.wav'],
    accept: ['音色全片一致', '单句 ≤5 秒', '无机械音'],
  },
  {
    n: 12,
    id: 'publish',
    title: '剪辑 + 封面 + 发布',
    mode: 'mixed',
    goal: '合片、加字幕与标识、出封面、过合规。',
    agent: ['用 cover-architect 生成封面三方案', '给出第 12 步的逐项清单'],
    manual: [
      { tool: '剪映', where: '时间线', action: '铺片段 → 去水印 → 音效/BGM → 配音对轨 → 字幕查错 → 片头 3 秒 AI 标识 → 导出 1080×1920' },
      { tool: '即梦', where: '图片生成', action: '出封面' },
    ],
    promptId: 'cover-architect',
    outputs: ['10_成片/EPxx_终版_v1.mp4', '11_封面与发布/封面.png', '11_封面与发布/发布自查.md'],
    accept: ['≥30 秒', '三处 AI 标识', '字幕无错别字', '无外链水印'],
  },
]

export function findStep(ref) {
  if (ref === undefined || ref === null || ref === '') return null
  const text = String(ref).trim().toLowerCase()
  return (
    STEPS.find((s) => String(s.n) === text) ||
    STEPS.find((s) => s.id === text) ||
    STEPS.find((s) => s.title.includes(text)) ||
    null
  )
}

export function nextStepFrom(n) {
  return STEPS.find((s) => s.n === n) || null
}
