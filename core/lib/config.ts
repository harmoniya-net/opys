import type { Artifact } from './artifact';
import type { Launch } from './launch';
import type { ValDefs } from './valdefs';

export interface TorbaConfigContext {
  /** User-provided value via `--mode`. Defaults to the CLI command name when omitted. */
  mode: string;
}

/** Anything that yields Artifacts — Artifact[], generators, async generators. */
export type ArtifactIterable = Iterable<Artifact> | AsyncIterable<Artifact>;

export interface TorbaManifestConfig {
  artifacts?: ArtifactIterable[];
  vars?: ValDefs;
  launch?: Launch;
  /**
   * Glob patterns (with `${var}` interpolation) for directories whose
   * contents must match the manifest exactly. After install, any file
   * matching one of these globs that isn't a manifest artifact is
   * deleted. See `Manifest.restrict` for syntax details.
   *
   * Typical use:
   * ```
   * restrict: ['${game_directory}/mods/**\/*.jar']
   * ```
   */
  restrict?: string[];
}

export interface TorbaConfig {
  output?: string;
  manifest?: TorbaManifestConfig;
  runClient?: {
    /** Working directory for the launched process. Overrides the manifest's `launch.workdir`. Supports `${var}` interpolation. */
    workdir?: string;
    vars?: Record<string, string>;
  };
}

export type TorbaConfigInput =
  | TorbaConfig
  | ((ctx: TorbaConfigContext) => TorbaConfig | Promise<TorbaConfig>);

/** Use as the default export of torba.config.mjs */
export function defineConfig(config: TorbaConfigInput): TorbaConfigInput {
  return config;
}

export async function resolveConfig(
  input: TorbaConfigInput,
  ctx: TorbaConfigContext,
): Promise<TorbaConfig> {
  return typeof input === 'function' ? input(ctx) : input;
}
