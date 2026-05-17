import { z } from 'zod';
import { type Ruleset, satisfiesRuleset } from '@torba/mojang-rules';
import type { OsOptions } from '@torba/mojang-rules';
import { parseShortRuleset, encodeShortRuleset } from './shorthand';

export interface ConditionalVal {
  readonly value: string;
  readonly rules: Ruleset;
}

/**
 * Variable definitions. A value is either a flat string or an ordered list of
 * rule-conditional arms — last matching arm wins at resolve time.
 */
export type ValDefs = Readonly<
  Record<string, string | readonly ConditionalVal[]>
>;

const ConditionalValRawSchema = z.object({
  value: z.string(),
  rules: z.any().optional(),
});

const ValDefsRawSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(ConditionalValRawSchema)]),
);

export function parseValDefs(raw: unknown): ValDefs {
  const parsed = ValDefsRawSchema.parse(raw);
  const out: Record<string, string | ConditionalVal[]> = {};
  for (const [key, val] of Object.entries(parsed)) {
    if (typeof val === 'string') {
      out[key] = val;
    } else {
      out[key] = val.map((arm) => ({
        value: arm.value,
        rules: arm.rules ? parseShortRuleset(arm.rules) : [],
      }));
    }
  }
  return out;
}

export function encodeValDefs(defs: ValDefs): unknown {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(defs)) {
    if (typeof val === 'string') {
      out[key] = val;
    } else {
      out[key] = val.map((arm) =>
        arm.rules.length === 0
          ? { value: arm.value }
          : { value: arm.value, rules: encodeShortRuleset(arm.rules) },
      );
    }
  }
  return out;
}

/** For each key: string → use as-is; arms → last matching arm wins. */
export function resolveValDefs(
  defs: ValDefs,
  os: OsOptions,
  feats: string[] = [],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(defs)) {
    if (typeof val === 'string') {
      result[key] = val;
      continue;
    }
    let chosen: string | undefined;
    for (const arm of val) {
      if (satisfiesRuleset(arm.rules, os, feats)) chosen = arm.value;
    }
    if (chosen !== undefined) result[key] = chosen;
  }
  return result;
}
