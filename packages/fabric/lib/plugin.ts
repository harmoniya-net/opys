import { definePlugin, launchGroups, type ChainablePlugin } from '@opys/dev';
import { resolveFabric, type FabricOptions } from './template';

/** Fabric mod loader. `version` is the Minecraft version; the loader build is
 * resolved to the latest stable unless pinned via `opts.loader`. */
export function fabric(
  version: string,
  opts: Omit<FabricOptions, 'version'> = {},
): ChainablePlugin {
  return definePlugin({
    name: 'fabric',
    async build(ctx) {
      const t = await resolveFabric({ version, ...opts });
      ctx.log('fabric', `resolved ${version}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}
