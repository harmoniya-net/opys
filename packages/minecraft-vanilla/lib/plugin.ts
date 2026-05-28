import { definePlugin, launchGroups, type OpysPlugin } from '@opys/dev';
import { resolveMinecraft } from './template';

/** Vanilla Minecraft client + libraries + assets. */
export function minecraft(version?: string): OpysPlugin {
  return definePlugin({
    name: 'minecraft',
    async build(ctx) {
      const t = await resolveMinecraft(version ? { version } : {});
      ctx.log('minecraft', `vanilla ${version ?? 'latest'}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}
