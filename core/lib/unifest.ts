import { z } from 'zod';
import type { OsOptions } from '@unifest/rules';
import { type Launch, LaunchSchema, encodeLaunch } from './launch';
import {
  type Unifact,
  UnifactSchema,
  encodeUnifact,
  unifactApplies,
  deduplicateUnifacts,
} from './unifact';
import {
  type ValDefs,
  parseValDefs,
  encodeValDefs,
  concatValDefs,
  emptyValDefs,
} from './valdefs';
import { type UnifactSize, addSize, zeroSize } from './size';

export interface Unifest {
  readonly vars: ValDefs;
  readonly launch?: Launch;
  readonly unifacts: ReadonlyArray<Unifact>;
}

const UnifestRawSchema = z.object({
  vars: z.any().optional(),
  launch: LaunchSchema.optional(),
  unifacts: z.array(UnifactSchema).optional(),
});

export const UnifestSchema: z.ZodType<Unifest> = UnifestRawSchema.transform(
  (raw): Unifest => ({
    vars: raw.vars != null ? parseValDefs(raw.vars) : emptyValDefs(),
    launch: raw.launch,
    unifacts: raw.unifacts ?? [],
  }),
) as unknown as z.ZodType<Unifest>;

export function encodeUnifest(u: Unifest): unknown {
  return {
    vars: encodeValDefs(u.vars),
    ...(u.launch ? { launch: encodeLaunch(u.launch) } : {}),
    unifacts: u.unifacts.map(encodeUnifact),
  };
}

export async function parseUnifest(input: string): Promise<Unifest> {
  const trimmed = input.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      return UnifestSchema.parse(JSON.parse(input));
    } catch (e) {
      throw new Error(`Failed to parse manifest as JSON: ${e}`);
    }
  }
  try {
    const { parse: parseTOML } = await import('smol-toml');
    return UnifestSchema.parse(parseTOML(input));
  } catch (e) {
    throw new Error(`Failed to parse manifest as TOML: ${e}`);
  }
}

export function filterUnifest(
  u: Unifest,
  os: OsOptions,
  feats: string[] = [],
): Unifest {
  return {
    vars: u.vars,
    launch: u.launch,
    unifacts: u.unifacts.filter((a) => unifactApplies(a, os, feats)),
  };
}

export function mergeUnifest(a: Unifest, b: Unifest): Unifest {
  return {
    vars: concatValDefs(a.vars, b.vars),
    launch: b.launch ?? a.launch,
    unifacts: deduplicateUnifacts([...a.unifacts, ...b.unifacts]),
  };
}

export function totalSize(u: Unifest): UnifactSize {
  return u.unifacts.reduce((acc, a) => addSize(acc, a.size), zeroSize());
}
