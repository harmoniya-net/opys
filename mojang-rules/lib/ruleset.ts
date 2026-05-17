import { z } from 'zod';
import { RuleSchema, type Rule, satisfiesRule } from './rule';
import type { OsOptions, OsName } from './os';

export type Ruleset = Rule[];

export const RulesetSchema: z.ZodType<Ruleset> = z.array(RuleSchema);

export function satisfiesRuleset(
  ruleset: Ruleset,
  os: OsOptions,
  feats: string[] = [],
): boolean {
  return ruleset.every((rule) => satisfiesRule(rule, os, feats));
}

export const emptyRuleset = (): Ruleset => [];

export const allowOsRuleset = (name: OsName): Ruleset => [
  { action: 'allow', os: { name } },
];
