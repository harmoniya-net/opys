import { posix } from 'node:path';
import { z } from 'zod';
import { type Ruleset, satisfiesRuleset } from '@torba/mojang-rules';
import type { OsOptions } from '@torba/mojang-rules';
import { parseShortRuleset } from './shorthand';
import {
  type Source,
  SourceWireSchema,
  decodeSource,
  encodeSource,
} from './source';
import {
  type Integrity,
  IntegrityWireSchema,
  encodeIntegrity,
} from './integrity';
import {
  type Discovery,
  DiscoveryWireSchema,
  decodeDiscovery,
  encodeDiscovery,
} from './discovery';
import {
  type ExtractRule,
  ExtractWireSchema,
  decodeExtract,
  encodeExtract,
} from './extract';

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

/** Wire shape — `rules` carries shorthand until decoded. */
export const ArtifactWireSchema = z.object({
  path: z.string(),
  source: SourceWireSchema,
  size: z.number().int().nonnegative().optional(),
  rules: z.any().optional(),
  integrity: IntegrityWireSchema.optional(),
  discovery: DiscoveryWireSchema.optional(),
  metadata: z.unknown().optional(),
  extract: ExtractWireSchema.optional(),
});
export type ArtifactWire = z.infer<typeof ArtifactWireSchema>;

/** Total decode — shorthand rules expand here, never in the schema. */
export function decodeArtifact(raw: ArtifactWire): Artifact {
  return {
    path: raw.path,
    source: decodeSource(raw.source),
    ...(raw.size !== undefined ? { size: raw.size } : {}),
    rules: raw.rules != null ? parseShortRuleset(raw.rules) : [],
    ...(raw.integrity !== undefined ? { integrity: raw.integrity } : {}),
    ...(raw.discovery !== undefined
      ? { discovery: decodeDiscovery(raw.discovery) }
      : {}),
    ...(raw.metadata !== undefined ? { metadata: raw.metadata } : {}),
    ...(raw.extract !== undefined
      ? { extract: decodeExtract(raw.extract) }
      : {}),
  };
}

export function encodeArtifact(u: Artifact): ArtifactWire {
  return {
    path: u.path,
    source: encodeSource(u.source),
    ...(u.size !== undefined ? { size: u.size } : {}),
    ...(u.rules.length > 0 ? { rules: u.rules } : {}),
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
