import { satisfies, type Ruleset, type SatisfiesOsOptions } from '../lib';

export const LINUX: SatisfiesOsOptions = {
  name: 'linux',
  version: '21.04  (Hippo)',
  arch: 'x86_64',
};

export const OSX: SatisfiesOsOptions = {
  name: 'osx',
  version: '11.1',
  arch: 'aarch64',
};

export const WINDOWS_7: SatisfiesOsOptions = {
  name: 'windows',
  version: '7.0.16320',
  arch: 'x86_64',
};

export const WINDOWS_10: SatisfiesOsOptions = {
  name: 'windows',
  version: '10.0.19041',
  arch: 'x86_64',
};

export const help = (rules: Ruleset) => {
  return {
    os: (opt: SatisfiesOsOptions) => satisfies(rules, opt, []),
    feats: (feats: string[]) => satisfies(rules, LINUX, feats),
    ok: () => satisfies(rules, LINUX, []),
  };
};
