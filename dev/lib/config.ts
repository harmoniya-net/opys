import type { Artifact, ValDefs, Manifest, Val, Valset } from '@torba/core';
import type { TorbaPlugin, LaunchGroups } from './plugin';

/** Map of plugin name → its launch groups, passed to launch accessors. */
export type PluginMap = Record<string, LaunchGroups>;

/** One entry of a config's assembled `args` — flattened to a `Valset`. */
export type ArgItem = Valset | Val | string;

export interface TorbaManifestConfig {
  /** Hand-written literal artifacts, merged with plugin output (last wins). */
  artifacts?: Artifact[];
  /** Override/extra vars layered on top of the merged plugin vars. */
  vars?: ValDefs;
  /** Launch command — typically `({ java }) => java.bin`. */
  command: (plugins: PluginMap) => string;
  /** Launch args — author-ordered named groups, flattened to a `Valset`. */
  args: (plugins: PluginMap) => ArgItem[];
  /** Working directory for the launched process. */
  workdir?: string | ((plugins: PluginMap) => string);
  /** Environment variables for the launched process. */
  envs?: ValDefs | ((plugins: PluginMap) => ValDefs);
  /** `restrict` globs swept clean after install. */
  restrict?: string[];
}

export interface TorbaConfig {
  /** Default manifest output path, relative to the config file. */
  output?: string;
  /** The plugins whose `build` hooks produce the manifest. */
  plugins: TorbaPlugin[];
  /** Declarative manifest fields, separate from tooling config. */
  manifest: TorbaManifestConfig;
  /**
   * Launch-time manifest patch. Re-run on every `torba launch`; the returned
   * partial is shallow-merged (per field) over the loaded manifest.
   */
  runClient?: (manifest: Manifest) => Partial<Manifest>;
}

export interface TorbaConfigContext {
  /** Value of `torba build --mode <m>`; empty string when unset. */
  mode: string;
}

export type TorbaConfigInput =
  | TorbaConfig
  | ((ctx: TorbaConfigContext) => TorbaConfig | Promise<TorbaConfig>);

/** Use as the default export of `torba.config.mjs`. */
export function defineConfig(input: TorbaConfigInput): TorbaConfigInput {
  return input;
}

/** Resolve a config input to a concrete `TorbaConfig`. */
export async function resolveConfig(
  input: TorbaConfigInput,
  ctx: TorbaConfigContext,
): Promise<TorbaConfig> {
  return typeof input === 'function' ? input(ctx) : input;
}
