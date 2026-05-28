import { definePlugin, type OpysPlugin } from '@opys/dev';
import {
  resolveCurseforge,
  type CurseForgeOptions,
  type CurseForgeFileRef,
} from './template';

/** Options for the {@link curseforge} plugin. */
export interface CurseforgePluginOptions extends CurseForgeOptions {
  /** CurseForge file references — numeric IDs or `/files/<id>` URLs. */
  files: CurseForgeFileRef[];
}

/** Mod files resolved from the CurseForge API. */
export function curseforge(options: CurseforgePluginOptions): OpysPlugin {
  return definePlugin({
    name: 'curseforge',
    async build(ctx) {
      const { files, ...rest } = options;
      const artifacts = await resolveCurseforge(rest, files);
      ctx.log('curseforge', `${artifacts.length} file(s)`);
      return { artifacts };
    },
  });
}
