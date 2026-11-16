import fs from 'node:fs'
import path from 'node:path'

let cache = null

/** Load library/index.json (prompt metadata only; the prompt texts stay in the user's own library). */
export function loadIndex(cfg) {
  const stamp = `${cfg.libraryIndexPath}:${cfg.libraryRoot}`
  if (cache && cache.stamp === stamp) return cache.entries
  let entries = []
  try {
    entries = JSON.parse(fs.readFileSync(cfg.libraryIndexPath, 'utf8'))
  } catch {
    entries = []
  }
  cache = { stamp, entries }
  return entries
}

export function getEntry(cfg, id) {
  if (!id) return null
  const key = String(id).trim().toLowerCase()
  return loadIndex(cfg).find((e) => e.id.toLowerCase() === key) || null
}

export function searchEntries(cfg, query) {
  const q = String(query || '').trim().toLowerCase()
  const all = loadIndex(cfg)
  if (!q) return all
  return all.filter((e) =>
    [e.id, e.title, e.tool, e.pasteInto, ...(e.tags || [])]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(q)),
  )
}

function isFile(target) {
  try {
    return fs.statSync(target).isFile()
  } catch {
    return false
  }
}

/**
 * Find the prompt file in the user's library.
 * Accepts the organized layout, the original flat layout, or any subfolder
 * that holds a file with the recorded legacy name.
 */
export function resolveFile(cfg, entry) {
  if (!entry || !cfg.libraryRoot) return ''
  const direct = path.join(cfg.libraryRoot, entry.file)
  if (isFile(direct)) return direct

  const wanted = new Set(
    [entry.legacy, path.basename(entry.file)]
      .filter(Boolean)
      .map((name) => name.toLowerCase()),
  )
  const hits = []
  const walk = (dir, depth) => {
    if (depth > 3 || hits.length >= 20) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of entries) {
      if (item.name.startsWith('.')) continue
      const child = path.join(dir, item.name)
      if (item.isDirectory()) walk(child, depth + 1)
      else if (wanted.has(item.name.toLowerCase())) hits.push(child)
    }
  }
  walk(cfg.libraryRoot, 0)
  return hits[0] || ''
}

export function promptPath(cfg, entry) {
  return resolveFile(cfg, entry)
}

/** Read a prompt file, returning the requested line range and a bounded preview. */
export function readPrompt(cfg, entry, opts = {}) {
  const file = resolveFile(cfg, entry)
  if (!file) {
    return { ok: false, path: '', reason: cfg.libraryRoot ? 'file-not-found' : 'library-not-configured' }
  }
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const from = Math.max(1, opts.from ?? 1)
  const to = Math.min(opts.to ?? lines.length, lines.length)
  const slice = lines.slice(from - 1, to).join('\n')
  const max = opts.maxChars ?? 1200
  return {
    ok: true,
    path: file,
    totalLines: lines.length,
    totalChars: text.length,
    from,
    to,
    chars: slice.length,
    preview: slice.length > max ? `${slice.slice(0, max)}\n…（已截断，完整内容见文件）` : slice,
  }
}
