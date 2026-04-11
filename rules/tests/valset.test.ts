import { describe, expect, test } from 'vitest';
import { RuleAction, RuleOsName, Ruleset, Val, Valset } from '../lib';
import { LINUX, OSX } from './fixtures';

describe('Val', () => {
  test('decode shorthand string', () => {
    const val = Val.CODEC.decode('hello');
    expect(val.value).toEqual(['hello']);
    expect(val.rules.length).toBe(0);
  });

  test('decode object', () => {
    const val = Val.CODEC.decode({
      rules: [{ action: RuleAction.Allow, os: { name: RuleOsName.Linux } }],
      value: 'world',
    });
    expect(val.value).toEqual(['world']);
    expect(val.rules.length).toBe(1);
    expect(val.rules.satisfies(LINUX)).toBe(true);
    expect(val.rules.satisfies(OSX)).toBe(false);
  });

  test('decode object with array value', () => {
    const val = Val.CODEC.decode({
      rules: [],
      value: ['a', 'b'],
    });
    expect(val.value).toEqual(['a', 'b']);
  });

  test('roundtrip shorthand', () => {
    const input = 'shorthand';
    const parsed = Val.CODEC.decode(input);
    const encoded = Val.CODEC.encode(parsed);
    expect(encoded).toBe(input);
  });

  test('roundtrip object', () => {
    const input = {
      rules: [{ action: RuleAction.Allow, os: { name: RuleOsName.Linux } }],
      value: ['v1', 'v2'],
    };
    const parsed = Val.CODEC.decode(input);
    const encoded = Val.CODEC.encode(parsed);

    expect(encoded).not.toBeInstanceOf(Val);

    expect(encoded).not.toBeInstanceOf(String);
    if (typeof encoded === 'string') throw new Error('Expected object');

    expect(encoded.value).toEqual(['v1', 'v2']);
  });

  test('toJSON shorthand', () => {
    const val = new Val(Ruleset.empty(), ['only']);
    expect(val.toJSON()).toBe('only');
  });

  test('toJSON complex', () => {
    const rules = Ruleset.CODEC.decode([
      { action: RuleAction.Allow, os: { name: RuleOsName.Linux } },
    ]);
    const val = new Val(rules, ['v1']);
    expect(val.toJSON()).toBe(val);
  });
});

describe('Valset', () => {
  test('decode array', () => {
    const valset = Valset.CODEC.decode(['a', 'b']);
    expect(valset.length).toBe(2);
  });

  test('iterator', () => {
    const valset = Valset.CODEC.decode(['a', 'b']);
    const results = [...valset];
    expect(results.length).toBe(2);
    expect(results[0]!.value).toEqual(['a']);
    expect(results[1]!.value).toEqual(['b']);
  });

  test('resolve basic', () => {
    const valset = Valset.CODEC.decode([
      {
        rules: [{ action: RuleAction.Allow, os: { name: RuleOsName.Linux } }],
        value: 'linux-only',
      },
      {
        rules: [{ action: RuleAction.Allow, os: { name: RuleOsName.Osx } }],
        value: 'osx-only',
      },
      'common',
    ]);

    expect(valset.resolve(LINUX)).toEqual(['linux-only', 'common']);
    expect(valset.resolve(OSX)).toEqual(['osx-only', 'common']);
  });

  test('resolve with multiple values in one Val', () => {
    const valset = Valset.CODEC.decode([
      {
        rules: [{ action: RuleAction.Allow, os: { name: RuleOsName.Linux } }],
        value: ['l1', 'l2'],
      },
    ]);
    expect(valset.resolve(LINUX)).toEqual(['l1', 'l2']);
    expect(valset.resolve(OSX)).toEqual([]);
  });

  test('roundtrip valset', () => {
    const input = ['a', 'b'];
    const parsed = Valset.CODEC.decode(input);
    const encoded = Valset.CODEC.encode(parsed);
    expect(encoded).toEqual(['a', 'b']);
  });
});
