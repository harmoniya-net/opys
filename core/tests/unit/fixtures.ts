import type { OsOptions, Ruleset } from '../../lib';
import { satisfiesRuleset } from '../../lib';

export const LINUX: OsOptions = {
  name: 'linux',
  version: '21.04 (Hippo)',
  arch: 'x86_64',
};

export const OSX: OsOptions = {
  name: 'osx',
  version: '11.1',
  arch: 'aarch64',
};

export const WINDOWS_7: OsOptions = {
  name: 'windows',
  version: '7.0.16320',
  arch: 'x86_64',
};

export const WINDOWS_10: OsOptions = {
  name: 'windows',
  version: '10.0.19041',
  arch: 'x86_64',
};

export const help = (rules: Ruleset) => ({
  os: (opt: OsOptions) => satisfiesRuleset(rules, opt, []),
  feats: (feats: string[]) => satisfiesRuleset(rules, LINUX, feats),
  ok: () => satisfiesRuleset(rules, LINUX, []),
});
