/**
 * Banned-word and red-line scan for short-drama publishing on Chinese platforms.
 * The lists come from the workshop's compliance checklist; keep them in sync with
 * docs/workflow-notes.md when the checklist changes.
 */

export const RULES = [
  {
    category: '血腥暴力',
    hint: '改成暗红痕迹 / 衣领红痕 / 金色光效；删掉断肢、内脏、喷溅特写',
    words: [
      '血液飞溅', '喷血', '鲜血淋漓', '血池', '血祭', '断头', '内脏出血', '血腥', '血洗',
      '分尸', '碎尸', '斩首', '砍头', '挖眼', '掏心', '剥皮', '凌迟', '虐杀', '酷刑',
      '断肢', '爆头', '穿刺', '屠杀', '灭门', '焚尸', '鞭尸', '尸横遍野', '血肉模糊',
      '骨裂', '脑浆', '内脏外露', '残肢断臂',
    ],
  },
  {
    category: '裸露低俗',
    hint: '改高领 / 小立领 / 交领；删掉暴露部位与低俗姿势的描述',
    words: [
      '全裸', '半裸', '袒胸露背', '露脐', '一丝不挂', '裸体', '赤膊', '露私密部位',
      '性感暴露', '挑逗性裸露', '低俗姿势', '酥胸半露', '衣不蔽体', '胸器', '美腿诱惑',
      '艳舞', '脱衣舞',
    ],
  },
  {
    category: '色情暗示',
    hint: '整段删除或改为情感冲突；不保留任何性相关描写',
    words: [
      '色情', '淫秽', '嫖娼', '卖淫', '性交易', '一夜情', '通奸', '乱伦', '恋童',
      '约炮', '撩骚', '打炮', '床上戏', '乳房', '阴部', '阴茎',
    ],
  },
  {
    category: '封建迷信',
    hint: '鬼怪僵尸改"异象/灵潮/封印物"；删符咒、法阵、占卜、冥婚、转世',
    words: [
      '血腥祭祀', '活人献祭', '血咒', '尸变', '僵尸', '妖魔鬼怪', '鬼怪', '冥婚',
      '轮回转世', '灵魂附体', '风水', '占卜', '算卦', '符咒', '巫术', '邪祟',
    ],
  },
  {
    category: '公序良俗',
    hint: '改为智斗与规则对抗；主角手段必须正当，反派必须有代价',
    words: ['自残', '自杀', '暴力教唆', '聚众斗殴', '黑帮火拼', '恐怖袭击', '校园暴力'],
  },
  {
    category: '宗教政治',
    hint: '完全不碰：删掉相关设定与名词',
    words: ['邪教', '极端宗教', '分裂', '恐怖组织', '反动', '颠覆'],
  },
]

/** Red lines that need human judgement; a keyword scan cannot decide them. */
export const MANUAL_TOPICS = [
  '真实国家/政府/军队/警察/司法机关；官场文、高干文、现役军旅',
  '影射现实政治事件与社会热点',
  '涉黑涉恶（美化黑恶、详细犯罪手法）、涉毒涉赌涉枪',
  '杀人游戏、死亡审判、复仇私刑；罪犯最终逃脱制裁',
  '未成年人恋爱、暴力、犯罪参与、烟酒毒',
  '畸形婚恋观（拜金/包养/潜规则）、美化出轨家暴 PUA',
  '颠覆历史事实、美化侵略、丑化历史人物与民族英雄',
  '详细描写医疗手术、尸体解剖；恶心猎奇内容',
]

function lineStarts(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function locate(starts, index) {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= index) lo = mid
    else hi = mid - 1
  }
  return { line: lo + 1, col: index - starts[lo] + 1 }
}

/**
 * @param {string} text
 * @param {{ limit?: number }} [opts]
 */
export function scanCompliance(text, opts = {}) {
  const limit = opts.limit ?? 80
  const starts = lineStarts(text)
  const raw = []

  for (const rule of RULES) {
    for (const word of rule.words) {
      let from = 0
      for (;;) {
        const index = text.indexOf(word, from)
        if (index === -1) break
        raw.push({ index, end: index + word.length, word, category: rule.category, hint: rule.hint })
        from = index + word.length
      }
    }
  }

  // Prefer the longest match; drop overlapping duplicates such as 血洗 inside 血洗城。
  raw.sort((a, b) => a.index - b.index || b.end - a.end)
  const accepted = []
  let cursor = -1
  for (const hit of raw) {
    if (hit.index < cursor) continue
    accepted.push(hit)
    cursor = hit.end
  }

  const counts = new Map()
  for (const hit of accepted) counts.set(hit.category, (counts.get(hit.category) || 0) + 1)

  const hits = accepted.slice(0, limit).map((hit) => ({
    ...locate(starts, hit.index),
    word: hit.word,
    category: hit.category,
    hint: hit.hint,
  }))

  return {
    total: accepted.length,
    shown: hits.length,
    truncated: accepted.length > hits.length,
    counts: [...counts.entries()].map(([category, count]) => ({ category, count })),
    hits,
  }
}
