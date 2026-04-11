import type { Unifact } from './unifact';
import type { ValDefs } from './valdefs';
import type { Launch } from './launch';

export interface OverrideConfig {
  path: string;
  url?: string;
  hashes?: Array<{ sha1: string } | { sha256: string }>;
  extra_hashes?: Array<{ sha1: string } | { sha256: string }>;
  exclude?: boolean;
}

export interface UnifestConfigContext {
  mode: 'build' | 'launch';
}

/** Anything that yields Unifacts — Unifact[], generators, async generators. */
export type ArtifactIterable = Iterable<Unifact> | AsyncIterable<Unifact>;

export interface UnifestConfig {
  output?: string;
  /** Each element may be a sync or async iterable of Unifacts. Flattened in order. */
  artifacts?: ArtifactIterable[];
  /** Variables baked into the built manifest. */
  vars?: ValDefs;
  /** JVM launch command baked into the built manifest. */
  command?: Launch;
  /** Local run configuration — not baked into the manifest. */
  runClient?: {
    vars?: Record<string, string>;
  };
}

export type UnifestConfigInput =
  | UnifestConfig
  | ((ctx: UnifestConfigContext) => UnifestConfig | Promise<UnifestConfig>);

/** Use as the default export of unifest.config.mjs */
export function unifestConfig(config: UnifestConfigInput): UnifestConfigInput {
  return config;
}

export async function resolveConfig(
  input: UnifestConfigInput,
  ctx: UnifestConfigContext,
): Promise<UnifestConfig> {
  return typeof input === 'function' ? input(ctx) : input;
}
