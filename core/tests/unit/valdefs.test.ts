import { describe, expect, it } from 'vitest';
import {
  parseValDef,
  encodeValDef,
  parseValDefs,
  resolveValDefs,
  concatValDefs,
  emptyValDefs,
  type ValDef,
  type ValDefs,
} from '../../lib/valdefs';
import { allowOsRuleset, emptyRuleset } from '@unifest/rules';

const LINUX = { name: 'linux', version: '', arch: 'x86_64' } as const;
const WINDOWS = { name: 'windows', version: '10', arch: 'x86_64' } as const;

describe('resolveValDefs', () => {
  it('last matching entry wins for duplicate keys', () => {
    const defs: ValDefs = [
      ['cp', { value: 'first', rules: [] }],
      ['cp', { value: 'second', rules: [] }],
    ];
    expect(resolveValDefs(defs, LINUX).cp).toBe('second');
  });

  it('platform-specific entry overrides unconditional one', () => {
    const defs: ValDefs = [
      ['sep', { value: ':', rules: [] }],
      ['sep', { value: ';', rules: allowOsRuleset('windows') }],
    ];
    expect(resolveValDefs(defs, WINDOWS).sep).toBe(';');
    expect(resolveValDefs(defs, LINUX).sep).toBe(':');
  });

  it('entry whose rules do not satisfy is omitted', () => {
    const defs: ValDefs = [
      ['win_only', { value: 'yes', rules: allowOsRuleset('windows') }],
    ];
    expect(resolveValDefs(defs, LINUX).win_only).toBeUndefined();
  });

  it('empty ValDefs resolves to empty object', () => {
    expect(resolveValDefs(emptyValDefs(), LINUX)).toEqual({});
  });
});

describe('concatValDefs', () => {
  it('concat with empty is identity', () => {
    const defs: ValDefs = [['a', { value: '1', rules: [] }]];
    expect(concatValDefs(defs, emptyValDefs()).length).toBe(1);
    expect(concatValDefs(emptyValDefs(), defs).length).toBe(1);
  });

  it('later entries from other shadow earlier on same key', () => {
    const a: ValDefs = [['k', { value: 'a', rules: [] }]];
    const b: ValDefs = [['k', { value: 'b', rules: [] }]];
    expect(resolveValDefs(concatValDefs(a, b), LINUX).k).toBe('b');
  });
});

describe('parseValDef', () => {
  it('string form decodes to unconditional ValDef', () => {
    const def = parseValDef('hello');
    expect(def.value).toBe('hello');
    expect(def.rules.length).toBe(0);
  });

  it('unconditional ValDef encodes to plain string', () => {
    const def: ValDef = { value: 'hello', rules: [] };
    expect(encodeValDef(def)).toBe('hello');
  });

  it('conditional ValDef encodes to object with rules', () => {
    const def: ValDef = { value: 'val', rules: allowOsRuleset('linux') };
    const encoded = encodeValDef(def);
    expect(typeof encoded).toBe('object');
  });
});
