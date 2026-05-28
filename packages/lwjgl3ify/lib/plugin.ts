import { definePlugin, launchGroups, type OpysPlugin } from '@opys/dev';
import { resolveLwjgl3ify, type Lwjgl3ifyOptions } from './template';

/** lwjgl3ify — a 1.7.10 Forge variant on a modern LWJGL3 runtime. */
export function lwjgl3ify(
  version: string,
  opts: Omit<Lwjgl3ifyOptions, 'version'> = {},
): OpysPlugin {
  return definePlugin({
    name: 'lwjgl3ify',
    async build(ctx) {
      const t = await resolveLwjgl3ify({ version, ...opts });
      ctx.log('lwjgl3ify', `resolved ${version}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}
