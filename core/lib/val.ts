import { z } from 'zod';
import {
  RulesetSchema,
  type Ruleset,
  satisfiesRuleset,
  type OsOptions,
} from '@torba/mojang-rules';
import { parseShortRuleset, encodeShortRuleset } from './shorthand';

export interface Val {
  readonly rules: Ruleset;
  readonly value: string[];
}

const ValRawSchema = z.union([
  z.string(),
  z.object({
    rules: z.any(),
    value: z.union([z.string(), z.array(z.string())]),
  }),
]);

export function parseVal(raw: z.infer<typeof ValRawSchema>): Val {
  if (typeof raw === 'string') return { rules: [], value: [raw] };
  const rules: Ruleset = raw.rules ? parseShortRuleset(raw.rules) : [];
  const value = Array.isArray(raw.value) ? raw.value : [raw.value];
  return { rules, value };
}

export function encodeVal(val: Val): unknown {
  if (val.rules.length === 0 && val.value.length === 1) return val.value[0]!;
  return { rules: encodeShortRuleset(val.rules), value: val.value };
}

export type Valset = Val[];

export function parseValset(raw: unknown[]): Valset {
  return z.array(ValRawSchema).parse(raw).map(parseVal);
}

export function encodeValset(vs: Valset): unknown[] {
  return vs.map(encodeVal);
}

export function resolveValset(
  vs: Valset,
  os: OsOptions,
  feats: string[] = [],
): string[] {
  return vs.reduce<string[]>((acc, val) => {
    if (satisfiesRuleset(val.rules, os, feats)) acc.push(...val.value);
    return acc;
  }, []);
}
