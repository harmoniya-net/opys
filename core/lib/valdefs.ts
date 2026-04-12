import { z } from 'zod';
import {
  type Ruleset,
  satisfiesRuleset,
  parseShortRuleset,
  encodeShortRuleset,
} from '@unifest/rules';
import type { OsOptions } from '@unifest/rules';

export interface ValDef {
  readonly value: string;
  readonly rules: Ruleset;
}

const ValDefRawSchema = z.union([
  z.string(),
  z.object({ value: z.string(), rules: z.any() }),
]);

export function parseValDef(raw: z.infer<typeof ValDefRawSchema>): ValDef {
  if (typeof raw === 'string') return { value: raw, rules: [] };
  return {
    value: raw.value,
    rules: raw.rules ? parseShortRuleset(raw.rules) : [],
  };
}

export function encodeValDef(d: ValDef): unknown {
  if (d.rules.length === 0) return d.value;
  return { value: d.value, rules: encodeShortRuleset(d.rules) };
}

/** Ordered list of [key, ValDef] entries — duplicate keys allowed, last match wins. */
export type ValDefs = ReadonlyArray<readonly [string, ValDef]>;

const ValDefsRawSchema = z.union([
  z.array(z.tuple([z.string(), ValDefRawSchema])),
  z.record(z.string(), ValDefRawSchema),
]);

export function parseValDefs(raw: z.infer<typeof ValDefsRawSchema>): ValDefs {
  if (Array.isArray(raw)) {
    return raw.map(([k, v]) => [k, parseValDef(v)] as const);
  }
  return Object.entries(raw)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, parseValDef(v)] as const);
}

export function encodeValDefs(defs: ValDefs): unknown {
  return defs.map(([k, v]) => [k, encodeValDef(v)]);
}

/** Resolve ValDefs: for each key, last matching entry wins. */
export function resolveValDefs(
  defs: ValDefs,
  os: OsOptions,
  feats: string[] = [],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, def] of defs) {
    if (satisfiesRuleset(def.rules, os, feats)) result[key] = def.value;
  }
  return result;
}

/** Append entries from other (later entries shadow earlier on conflict). */
export const concatValDefs = (a: ValDefs, b: ValDefs): ValDefs => [...a, ...b];

export const emptyValDefs = (): ValDefs => [];

/** Build a ValDefs from a plain record of unconditional string values. */
export const valDefsFromRecord = (rec: Record<string, string>): ValDefs =>
  Object.entries(rec).map(([k, v]) => [k, { value: v, rules: [] }] as const);
