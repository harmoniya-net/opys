import { describe, expect, test } from 'vitest';
import {
  parseVal,
  encodeVal,
  parseValset,
  encodeValset,
  resolveValset,
} from '../../lib/val';
import { LINUX, OSX } from './fixtures';

describe('Val', () => {
  test('decode shorthand string', () => {
    const val = parseVal('hello');
    expect(val.value).toEqual(['hello']);
    expect(val.rules.length).toBe(0);
  });

  test('decode object', () => {
    const val = parseVal({
      rules: [{ action: 'allow', os: { name: 'linux' } }],
      value: 'world',
    });
    expect(val.value).toEqual(['world']);
    expect(val.rules.length).toBe(1);
    expect(val.rules[0]!.action).toBe('allow');
  });

  test('decode object with array value', () => {
    const val = parseVal({ rules: [], value: ['a', 'b'] });
    expect(val.value).toEqual(['a', 'b']);
  });

  test('decode object with no rules → empty ruleset', () => {
    const val = parseVal({ rules: undefined, value: 'x' });
    expect(val.rules).toEqual([]);
    expect(val.value).toEqual(['x']);
  });

  test('roundtrip shorthand', () => {
    const parsed = parseVal('shorthand');
    const encoded = encodeVal(parsed);
    expect(encoded).toBe('shorthand');
  });

  test('roundtrip object', () => {
    const input = {
      rules: [{ action: 'allow' as const, os: { name: 'linux' as const } }],
      value: ['v1', 'v2'],
    };
    const parsed = parseVal(input);
    const encoded = encodeVal(parsed);
    expect(typeof encoded).toBe('object');
    if (typeof encoded === 'string') throw new Error('Expected object');
    expect((encoded as { value: string[] }).value).toEqual(['v1', 'v2']);
  });

  test('unconditional single value encodes to plain string', () => {
    const val = { rules: [], value: ['only'] };
    expect(encodeVal(val)).toBe('only');
  });
});

describe('Valset', () => {
  test('parse array', () => {
    const vs = parseValset(['a', 'b']);
    expect(vs.length).toBe(2);
  });

  test('resolve basic', () => {
    const vs = parseValset([
      {
        rules: [{ action: 'allow', os: { name: 'linux' } }],
        value: 'linux-only',
      },
      { rules: [{ action: 'allow', os: { name: 'osx' } }], value: 'osx-only' },
      'common',
    ]);
    expect(resolveValset(vs, LINUX)).toEqual(['linux-only', 'common']);
    expect(resolveValset(vs, OSX)).toEqual(['osx-only', 'common']);
  });

  test('resolve with multiple values in one Val', () => {
    const vs = parseValset([
      {
        rules: [{ action: 'allow', os: { name: 'linux' } }],
        value: ['l1', 'l2'],
      },
    ]);
    expect(resolveValset(vs, LINUX)).toEqual(['l1', 'l2']);
    expect(resolveValset(vs, OSX)).toEqual([]);
  });

  test('roundtrip valset', () => {
    const input = ['a', 'b'];
    const parsed = parseValset(input);
    const encoded = encodeValset(parsed);
    expect(encoded).toEqual(['a', 'b']);
  });
});
