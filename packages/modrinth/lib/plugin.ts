import { definePlugin, type ChainablePlugin } from '@opys/dev';
import { minecraft } from '@opys/minecraft-vanilla';
import { fabric } from '@opys/fabric';
import { forge } from '@opys/forge';
import { neoforge } from '@opys/neoforge';
import {
  resolveModrinth,
  type ModrinthOptions,
  type ModrinthVersionRef,
} from './template';
import {
  resolveModrinthModpack,
  loaderSpec,
  type LoaderSpec,
  type ModrinthModpackRef,
} from './modpack';

/** Options for the {@link modrinth} plugin. */
export interface ModrinthPluginOptions extends ModrinthOptions {
  /** Modrinth version references — version IDs or `/version/<id>` URLs. */
  versions: ModrinthVersionRef[];
}

/** Mod files resolved from the Modrinth API. */
export function modrinth(options: ModrinthPluginOptions): ChainablePlugin {
  return definePlugin({
    name: 'modrinth',
    async build(ctx) {
      const { versions, ...rest } = options;
      const artifacts = await resolveModrinth(rest, versions);
      ctx.log('modrinth', `${artifacts.length} file(s)`);
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

/**
 * All-in-one Modrinth modpack plugin. Detects the game version and mod loader
 * from the pack's `modrinth.index.json`, stands up the matching loader (which
 * already bundles vanilla), installs every client-side modpack file, and
 * extracts the pack's `overrides/`. The loader's launch groups (`command`,
 * `jvmArgs`, `mainClass`, `gameArgs`) are re-exposed under this one plugin, so
 * a config wires it identically regardless of which loader the pack uses:
 *
 * ```js
 * plugins: [modrinthModpack('xVcA1pSL'), java('17')],
 * manifest: {
 *   command: ({ modrinthModpack }) => modrinthModpack.command,
 *   args: ({ modrinthModpack }) => [
 *     modrinthModpack.jvmArgs,
 *     modrinthModpack.mainClass,
 *     modrinthModpack.gameArgs,
 *   ],
 *   workdir: '${game_directory}',
 * },
 * ```
 *
 * Java is intentionally left out — add `java(...)` separately (the `.mrpack`
 * format does not pin a JDK).
 */
export function modrinthModpack(ref: ModrinthModpackRef): ChainablePlugin {
  return definePlugin({
    name: 'modrinthModpack',
    async build(ctx) {
      const pack = await resolveModrinthModpack(ref);
      const loader = loaderPlugin(loaderSpec(pack.dependencies));
      const base = await loader.build(ctx);

      ctx.log(
        'modrinthModpack',
        `${pack.index.name} — ${loader.name} + ${pack.files.length} file(s)`,
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
