import type { OsConstraint } from './os';
import type { FeatureConstraint } from './features';

export type RuleAction = 'allow' | 'disallow';

/**
 * A rule is an action plus an optional `os` or `features` constraint.
 *
 * The Mojang-standard shape only, and the one the evaluator takes. opys
 * manifests may also spell a rule as a shorthand string (`'allow.os.linux'`);
 * that spelling, and the `Rule` type that admits both, belong to `@opys/core`.
 */
export type MojangRule =
  | { action: RuleAction; os: OsConstraint }
  | { action: RuleAction; features: FeatureConstraint }
  | { action: RuleAction };
