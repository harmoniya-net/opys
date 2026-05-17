import { posix } from 'node:path';
import { z } from 'zod';
import {
  type Ruleset,
  satisfiesRuleset,
  parseShortRuleset,
} from '@torba/mojang-rules';
import type { OsOptions } from '@torba/mojang-rules';
import { type Source, SourceSchema, encodeSource } from './source';
import { type Integrity, IntegritySchema, encodeIntegrity } from './integrity';
import { type Discovery, DiscoverySchema, encodeDiscovery } from './discovery';
import { type ExtractRule, ExtractSchema, encodeExtract } from './extract';

export interface Artifact {
  readonly path: string;
  readonly source: Source;
  readonly size?: number;
  readonly rules: Ruleset;
  readonly integrity?: Integrity;
  /**
   * How to discover `integrity` / `size` at install time when they can't be
   * baked in — for a `url` source tracking a moving 3rd-party file. Resolved
   * before download; a discovered hash takes precedence over any literal
   * `integrity` above.
   */
  readonly discovery?: Discovery;
  readonly metadata?: unknown;
  readonly extract?: ExtractRule[];
}

const ArtifactRawSchema = z.object({
  path: z.string(),
  source: SourceSchema,
  size: z.number().int().nonnegative().optional(),
  rules: z.any().optional(),
  integrity: IntegritySchema.optional(),
  discovery: DiscoverySchema.optional(),
  metadata: z.unknown().optional(),
  extract: ExtractSchema.optional(),
});

export const ArtifactSchema: z.ZodType<Artifact> = ArtifactRawSchema.transform(
  (raw): Artifact => ({
    path: raw.path,
    source: raw.source,
    size: raw.size,
    rules: raw.rules != null ? parseShortRuleset(raw.rules) : [],
    integrity: raw.integrity,
    discovery: raw.discovery,
    metadata: raw.metadata,
    extract: raw.extract,
  }),
) as unknown as z.ZodType<Artifact>;

export function encodeArtifact(u: Artifact): unknown {
  return {
    path: u.path,
    source: encodeSource(u.source),
    ...(u.size !== undefined ? { size: u.size } : {}),
    rules: u.rules.length > 0 ? u.rules : undefined,
    ...(u.integrity ? { integrity: encodeIntegrity(u.integrity) } : {}),
    ...(u.discovery ? { discovery: encodeDiscovery(u.discovery) } : {}),
    ...(u.metadata !== undefined ? { metadata: u.metadata } : {}),
    ...(u.extract ? { extract: encodeExtract(u.extract) } : {}),
  };
}

/** Deduplicate by normalized path — later entries win. */
export function deduplicateArtifacts(artifacts: Artifact[]): Artifact[] {
  const map = new Map<string, Artifact>();
  for (const u of artifacts) {
    map.set(posix.normalize(u.path), u);
  }
  return [...map.values()];
}

export function artifactApplies(
  u: Artifact,
  os: OsOptions,
  feats: string[] = [],
): boolean {
  return satisfiesRuleset(u.rules, os, feats);
}
