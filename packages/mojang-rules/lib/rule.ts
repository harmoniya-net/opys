import type { OsConstraint } from './os';
import type { FeatureConstraint } from './features';

export type RuleAction = 'allow' | 'disallow';

/**
 * A rule is an action plus an optional `os` or `features` constraint.
 *
 * This is the Mojang-standard shape only. The opys shorthand spelling
 * (`'allow.os.linux'`) is a separate wire form owned by `@opys/core`.
 */
export type Rule =
  | { action: RuleAction; os: OsConstraint }
  | { action: RuleAction; features: FeatureConstraint }
  | { action: RuleAction };
