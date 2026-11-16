import fs from 'node:fs'
import path from 'node:path'

let cache = null

/**
 * The committed index is masked (real-person names replaced with initials).
 * A machine-local `voice-index.local.json` built by `npm run build:voices`
 * holds the real file names and takes precedence when it exists.
 */
export function indexFile(cfg) {
  const local = path.join(path.dirname(cfg.voiceIndexPath), 'voice-index.local.json')
  if (fs.existsSync(local)) return local
  return cfg.voiceIndexPath
}

export function isLocalIndex(cfg) {
  return indexFile(cfg) !== cfg.voiceIndexPath
}

export function loadVoiceIndex(cfg) {
  const file = indexFile(cfg)
  if (cache && cache.path === file) return cache.items
  let items = []
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    items = Array.isArray(raw) ? raw : raw.items || []
  } catch {
    items = []
  }
  cache = { path: file, items }
  return items
}

/**
 * @param {object} cfg
 * @param {{ query?: string, category?: string, limit?: number }} [opts]
 */
export function searchVoices(cfg, opts = {}) {
  const items = loadVoiceIndex(cfg)
  const q = String(opts.query || '').trim().toLowerCase()
  const category = String(opts.category || '').trim()
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100)

  const matched = items.filter((item) => {
    if (category && item.category !== category && item.group !== category) return false
    if (!q) return true
    return `${item.name} ${item.group} ${item.category}`.toLowerCase().includes(q)
  })

  return {
    total: matched.length,
    shown: matched.slice(0, limit),
    categories: summarize(items),
    libraryRoot: cfg.voicesRoot,
    indexFile: indexFile(cfg),
    masked: !isLocalIndex(cfg),
  }
}

function summarize(items) {
  const map = new Map()
  for (const item of items) {
    const key = `${item.category}/${item.group || '—'}`
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}
