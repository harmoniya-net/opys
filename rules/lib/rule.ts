import { z } from 'zod';
import {
  OsConstraintSchema,
  type OsConstraint,
  type OsOptions,
  satisfiesOs,
} from './os';
import {
  FeatureConstraintSchema,
  type FeatureConstraint,
  satisfiesFeatures,
} from './features';

export type RuleAction = 'allow' | 'disallow';

export type Rule =
  | { action: RuleAction; os: OsConstraint }
  | { action: RuleAction; features: FeatureConstraint }
  | { action: RuleAction };

export const RuleSchema: z.ZodType<Rule> = z.union([
  z.object({ action: z.string(), os: OsConstraintSchema }),
  z.object({ action: z.string(), features: FeatureConstraintSchema }),
  z.object({ action: z.string() }),
]) as z.ZodType<Rule>;

export function satisfiesRule(
  rule: Rule,
  os: OsOptions,
  feats: string[] = [],
): boolean {
  const allow = rule.action === 'allow';
  if ('os' in rule) return satisfiesOs(rule.os, os) === allow;
  if ('features' in rule)
    return satisfiesFeatures(rule.features, feats) === allow;
  return allow;
}
