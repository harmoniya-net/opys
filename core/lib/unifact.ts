import { posix } from 'node:path';
import { z } from 'zod';
import {
  type Ruleset,
  satisfiesRuleset,
  parseShortRuleset,
} from '@unifest/rules';
import type { OsOptions } from '@unifest/rules';
import { type Source, SourceSchema, encodeSource } from './source';
import { unknownSize } from './size';
import {
  type Integrity,
  IntegritySchema,
  encodeIntegrity,
  skipIntegrity,
} from './integrity';
import { type UnifactSize, SizeSchema, encodeSize } from './size';
import { type ExtractRule, ExtractSchema, encodeExtract } from './extract';

export interface Unifact {
  readonly path: string;
  readonly source: Source;
  readonly size: UnifactSize;
  readonly rules: Ruleset;
  readonly integrity: Integrity;
  readonly metadata?: unknown;
  readonly extract?: ExtractRule[];
}

const UnifactRawSchema = z.object({
  path: z.string(),
  source: SourceSchema,
  size: SizeSchema.optional(),
  rules: z.any().optional(),
  integrity: IntegritySchema.optional(),
  metadata: z.unknown().optional(),
  extract: ExtractSchema.optional(),
});

export const UnifactSchema: z.ZodType<Unifact> = UnifactRawSchema.transform(
  (raw): Unifact => ({
    path: raw.path,
    source: raw.source,
    size: raw.size ?? unknownSize(),
    rules: raw.rules != null ? parseShortRuleset(raw.rules) : [],
    integrity: raw.integrity ?? skipIntegrity(),
    metadata: raw.metadata,
    extract: raw.extract,
  }),
) as unknown as z.ZodType<Unifact>;

export function encodeUnifact(u: Unifact): unknown {
  return {
    path: u.path,
    source: encodeSource(u.source),
    size: encodeSize(u.size),
    rules: u.rules.length > 0 ? u.rules : undefined,
    integrity: encodeIntegrity(u.integrity),
    ...(u.metadata !== undefined ? { metadata: u.metadata } : {}),
    ...(u.extract ? { extract: encodeExtract(u.extract) } : {}),
  };
}

/** Deduplicate by normalized path — later entries win. */
export function deduplicateUnifacts(unifacts: Unifact[]): Unifact[] {
  const map = new Map<string, Unifact>();
  for (const u of unifacts) {
    map.set(posix.normalize(u.path), u);
  }
  return [...map.values()];
}

export function unifactApplies(
  u: Unifact,
  os: OsOptions,
  feats: string[] = [],
): boolean {
  return satisfiesRuleset(u.rules, os, feats);
}
