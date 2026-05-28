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

const RuleActionSchema = z.enum(['allow', 'disallow']);

/**
 * The single rule schema for the whole monorepo — used to parse rules out
 * of Mojang version JSON, Forge recipes, and `opys.json` artifacts alike.
 * `z.infer` of this is exactly `Rule`, so no cast is needed.
 */
export const RuleSchema = z.union([
  z.object({ action: RuleActionSchema, os: OsConstraintSchema }),
  z.object({ action: RuleActionSchema, features: FeatureConstraintSchema }),
  z.object({ action: RuleActionSchema }),
]);

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
