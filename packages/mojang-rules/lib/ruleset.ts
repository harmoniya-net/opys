import type { MojangRule } from './rule';
import type { OsName } from './os';

/** Every rule expanded — an opys `Ruleset` parses into this. */
export type MojangRuleset = MojangRule[];

export const emptyRuleset = (): MojangRuleset => [];

export const allowOsRuleset = (name: OsName): MojangRuleset => [
  { action: 'allow', os: { name } },
];
