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
  artifacts?: ArtifactIterable[];
  vars?: ValDefs;
  command?: Launch;
  runClient?: { vars?: Record<string, string> };
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
