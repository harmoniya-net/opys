import type {
  Artifact,
  CleanupRule,
  ValDefs,
  Manifest,
  Val,
  Valset,
} from '@opys/core';
import type { OpysPlugin, LaunchGroups } from './plugin';

/** Map of plugin name → its launch groups, passed to launch accessors. */
export type PluginMap = Record<string, LaunchGroups>;

/** One entry of a config's assembled `args` — flattened to a `Valset`. */
export type ArgItem = Valset | Val | string;

export interface OpysManifestConfig {
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
  /**
   * Files to remove after install: what `includes` matches, less `excludes`.
   * A file the manifest installs is never removed.
   */
  cleanup?: CleanupRule[];
}

export interface OpysConfig {
  /**
   * Where `opys build` writes the bundle, relative to the config file —
   * conventionally `<name>.opys`.
   */
  output?: string;
  /** The plugins whose `build` hooks produce the manifest. */
  plugins: OpysPlugin[];
  /** Declarative manifest fields, separate from tooling config. */
  manifest: OpysManifestConfig;
  /**
   * Launch-time manifest patch. Re-run on every `opys launch`; the returned
   * partial is shallow-merged (per field) over the loaded manifest.
   */
  runClient?: (manifest: Manifest) => Partial<Manifest>;
}

export interface OpysConfigContext {
  /** Value of `--mode <m>`; the cli passes the command's name when unset. */
  mode: string;
}

export type OpysConfigInput =
  OpysConfig | ((ctx: OpysConfigContext) => OpysConfig | Promise<OpysConfig>);

/** Use as the default export of `opys.config.mjs`. */
export function defineConfig(input: OpysConfigInput): OpysConfigInput {
  return input;
}

/** Resolve a config input to a concrete `OpysConfig`. */
export async function resolveConfig(
  input: OpysConfigInput,
  ctx: OpysConfigContext,
): Promise<OpysConfig> {
  return typeof input === 'function' ? input(ctx) : input;
}
