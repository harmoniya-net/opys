import { definePlugin, launchGroups, type ChainablePlugin } from '@opys/dev';
import { resolveForge, type ForgeOptions } from './template';

/** Forge mod loader (1.7–1.12 legacy + 1.13+ processor eras). */
export function forge(
  version: string,
  opts: Omit<ForgeOptions, 'version'> = {},
): ChainablePlugin {
  return definePlugin({
    name: 'forge',
    async build(ctx) {
      const t = await resolveForge({ version, ...opts });
      ctx.log('forge', `resolved ${version}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}
