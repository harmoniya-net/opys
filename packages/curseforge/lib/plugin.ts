import { definePlugin, type ChainablePlugin } from '@opys/dev';
import { minecraft } from '@opys/minecraft-vanilla';
import { fabric } from '@opys/fabric';
import { forge } from '@opys/forge';
import { neoforge } from '@opys/neoforge';
import {
  resolveCurseforge,
  type CurseForgeOptions,
  type CurseForgeFileRef,
} from './template';
import {
  resolveCurseforgeModpack,
  loaderSpecFromManifest,
  type LoaderSpec,
} from './modpack';

/** Options for the {@link curseforge} plugin. */
export interface CurseforgePluginOptions extends CurseForgeOptions {
  /** CurseForge file references — numeric IDs or `/files/<id>` URLs. */
  files: CurseForgeFileRef[];
}

/** Mod files resolved from the CurseForge API. */
export function curseforge(options: CurseforgePluginOptions): ChainablePlugin {
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

/** Turn a {@link LoaderSpec} into the matching opys loader plugin. */
function loaderPlugin(spec: LoaderSpec): ChainablePlugin {
  switch (spec.loader) {
    case 'fabric':
      return fabric(spec.minecraft, { loader: spec.fabricLoader });
    case 'forge':
      return forge(spec.version);
    case 'neoforge':
      return neoforge(spec.version);
    case 'vanilla':
      return minecraft(spec.minecraft);
  }
}

/** Options for the {@link curseforgeModpack} plugin. */
export interface CurseforgeModpackOptions {
  /** CurseForge API key — required to resolve the pack and its mod files. */
  token: string;
  /** The modpack's CurseForge file reference — a numeric ID or `/files/<id>` URL. */
  file: CurseForgeFileRef;
}

/**
 * All-in-one CurseForge modpack plugin. Detects the game version and mod
 * loader from the pack's `manifest.json`, stands up the matching loader (which
 * already bundles vanilla), installs every modpack mod file, and extracts the
 * pack's `overrides/`. The loader's launch groups (`command`, `jvmArgs`,
 * `mainClass`, `gameArgs`) are re-exposed under this one plugin, so a config
 * wires it identically regardless of which loader the pack uses:
 *
 * ```js
 * plugins: [curseforgeModpack({ token, file: 1040985 }), java('17')],
 * manifest: {
 *   command: ({ curseforgeModpack }) => curseforgeModpack.command,
 *   args: ({ curseforgeModpack }) => [
 *     curseforgeModpack.jvmArgs,
 *     curseforgeModpack.mainClass,
 *     curseforgeModpack.gameArgs,
 *   ],
 *   workdir: '${game_directory}',
 * },
 * ```
 *
 * Java is intentionally left out — add `java(...)` separately (the manifest
 * does not pin a JDK).
 */
export function curseforgeModpack(
  options: CurseforgeModpackOptions,
): ChainablePlugin {
  return definePlugin({
    name: 'curseforgeModpack',
    async build(ctx) {
      const pack = await resolveCurseforgeModpack(
        { token: options.token },
        options.file,
      );
      const loader = loaderPlugin(loaderSpecFromManifest(pack.manifest));
      const base = await loader.build(ctx);

      ctx.log(
        'curseforgeModpack',
        `${pack.manifest.name} — ${loader.name} + ${pack.files.length} file(s)`,
      );

      return {
        artifacts: [...(base.artifacts ?? []), ...pack.files, pack.overrides],
        vars: base.vars,
        launch: base.launch,
        envs: base.envs,
      };
    },
  });
}
