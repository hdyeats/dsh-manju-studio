import { resolveConfig } from './lib/config.js'
import { buildTools } from './lib/tools.js'

export const name = 'manju-studio'

/** The tool registry this plugin registers into. */
export const inject = ['tools']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ libraryRoot?: string, voicesRoot?: string, projectsRoot?: string }} [config]
 */
export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config || {})
  for (const tool of buildTools(resolved)) {
    const dispose = ctx.tools.register(tool)
    ctx.effect?.(() => dispose)
  }
}
