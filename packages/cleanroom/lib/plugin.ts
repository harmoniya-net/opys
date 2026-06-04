import { definePlugin, launchGroups, type ChainablePlugin } from '@opys/dev';
import { resolveCleanroom, type CleanroomOptions } from './template';

/** Cleanroom — a 1.12.2 Forge variant. */
export function cleanroom(
  version: string,
  opts: Omit<CleanroomOptions, 'version'> = {},
): ChainablePlugin {
  return definePlugin({
    name: 'cleanroom',
    async build(ctx) {
      const t = await resolveCleanroom({ version, ...opts });
      ctx.log('cleanroom', `resolved ${version}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}
