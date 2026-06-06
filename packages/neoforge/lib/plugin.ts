import { definePlugin, launchGroups, type ChainablePlugin } from '@opys/dev';
import { resolveNeoForge, type NeoForgeOptions } from './template';

/** NeoForge mod loader (1.20.2+). */
export function neoforge(
  version: string,
  opts: Omit<NeoForgeOptions, 'version'> = {},
): ChainablePlugin {
  return definePlugin({
    name: 'neoforge',
    async build(ctx) {
      const t = await resolveNeoForge({ version, ...opts });
      ctx.log('neoforge', `resolved ${version}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}
