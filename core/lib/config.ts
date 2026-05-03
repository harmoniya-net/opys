import type { Artifact } from './artifact';
import type { ValDefs } from './valdefs';
import type { Launch } from './launch';

export interface OverrideConfig {
  path: string;
  url?: string;
  hashes?: Array<{ sha1: string } | { sha256: string }>;
  extraHashes?: Array<{ sha1: string } | { sha256: string }>;
  exclude?: boolean;
}

export interface TorbaConfigContext {
  /** User-provided value via `--mode`. Defaults to the CLI command name when omitted. */
  mode: string;
}

/** Anything that yields Artifacts — Artifact[], generators, async generators. */
export type ArtifactIterable = Iterable<Artifact> | AsyncIterable<Artifact>;

export interface TorbaConfig {
  output?: string;
  artifacts?: ArtifactIterable[];
  vars?: ValDefs;
  command?: Launch;
  runClient?: { vars?: Record<string, string> };
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
