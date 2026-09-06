import type { Rule } from './rule';
import type { OsName } from './os';

export type Ruleset = Rule[];

export const emptyRuleset = (): Ruleset => [];

export const allowOsRuleset = (name: OsName): Ruleset => [
  { action: 'allow', os: { name } },
];
