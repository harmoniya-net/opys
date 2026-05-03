import { describe, expect, it } from 'vitest';
import {
  parseValDefs,
  encodeValDefs,
  resolveValDefs,
  type ValDefs,
} from '../../lib/valdefs';
import { allowOsRuleset } from '@torba/rules';

const LINUX = { name: 'linux', version: '', arch: 'x86_64' } as const;
const WINDOWS = { name: 'windows', version: '10', arch: 'x86_64' } as const;

describe('resolveValDefs', () => {
  it('flat string values pass through', () => {
    const defs: ValDefs = { root: '.', name: 'torba' };
    expect(resolveValDefs(defs, LINUX)).toEqual({ root: '.', name: 'torba' });
  });

  it('last matching arm wins', () => {
    const defs: ValDefs = {
      sep: [
        { value: ':', rules: [] },
        { value: ';', rules: allowOsRuleset('windows') },
      ],
    };
    expect(resolveValDefs(defs, WINDOWS).sep).toBe(';');
    expect(resolveValDefs(defs, LINUX).sep).toBe(':');
  });

  it('arm whose rules do not satisfy is omitted when none match', () => {
    const defs: ValDefs = {
      win_only: [{ value: 'yes', rules: allowOsRuleset('windows') }],
    };
    expect(resolveValDefs(defs, LINUX).win_only).toBeUndefined();
  });

  it('empty ValDefs resolves to empty object', () => {
    expect(resolveValDefs({}, LINUX)).toEqual({});
  });
});

describe('parse / encode', () => {
  it('string values round-trip', () => {
    const raw = { root: '.', name: 'torba' };
    expect(encodeValDefs(parseValDefs(raw))).toEqual(raw);
  });

  it('arm arrays round-trip with shorthand rules', () => {
    const raw = {
      sep: [
        { value: ';', rules: 'allow.os.windows' },
        { value: ':', rules: 'allow.os.linux' },
      ],
    };
    const decoded = parseValDefs(raw);
    expect(encodeValDefs(decoded)).toEqual(raw);
  });

  it('rule-less arms encode without rules key', () => {
    const defs: ValDefs = { k: [{ value: 'v', rules: [] }] };
    expect(encodeValDefs(defs)).toEqual({ k: [{ value: 'v' }] });
  });
});
