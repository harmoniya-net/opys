import { describe, expect, test } from 'vitest';
import { parseShortRuleset } from '../../lib';

describe('parseShortRuleset', () => {
  test('action-only shorthand', () => {
    expect(parseShortRuleset('allow')).toEqual([{ action: 'allow' }]);
    expect(parseShortRuleset('disallow')).toEqual([{ action: 'disallow' }]);
  });

  test('os name shorthand', () => {
    expect(parseShortRuleset('allow.os.linux')).toEqual([
      { action: 'allow', os: { name: 'linux' } },
    ]);
    expect(parseShortRuleset('disallow.os.windows')).toEqual([
      { action: 'disallow', os: { name: 'windows' } },
    ]);
  });

  test('os name@version shorthand', () => {
    expect(parseShortRuleset('allow.os.osx@^10\\.')).toEqual([
      { action: 'allow', os: { name: 'osx', version: '^10\\.' } },
    ]);
  });

  test('arch shorthand', () => {
    expect(parseShortRuleset('allow.arch.x86_64')).toEqual([
      { action: 'allow', os: { arch: 'x86_64' } },
    ]);
  });

  test('feature shorthand sets the named flag to true', () => {
    expect(parseShortRuleset('allow.features.has_custom_resolution')).toEqual([
      { action: 'allow', features: { has_custom_resolution: true } },
    ]);
  });

  test('array of shorthands maps element-wise', () => {
    expect(
      parseShortRuleset(['allow.os.linux', 'disallow.os.windows']),
    ).toEqual([
      { action: 'allow', os: { name: 'linux' } },
      { action: 'disallow', os: { name: 'windows' } },
    ]);
  });

  test('passes pre-expanded Rule objects through unchanged', () => {
    const rule = { action: 'allow' as const, os: { name: 'linux' as const } };
    expect(parseShortRuleset(rule)).toEqual([rule]);
    expect(parseShortRuleset([rule])).toEqual([rule]);
  });

  test('rejects unknown action', () => {
    expect(() => parseShortRuleset('maybe.os.linux')).toThrow(/Unknown action/);
  });

  test('rejects invalid os name', () => {
    expect(() => parseShortRuleset('allow.os.bsd')).toThrow(/invalid os name/);
  });

  test('rejects invalid arch', () => {
    expect(() => parseShortRuleset('allow.arch.m68k')).toThrow(/invalid arch/);
  });

  test('rejects unknown rule type', () => {
    expect(() => parseShortRuleset('allow.bogus.x')).toThrow(
      /unknown rule type/,
    );
  });

  test('rejects empty os / features / arch', () => {
    expect(() => parseShortRuleset('allow.os')).toThrow(/missing OS name/);
    expect(() => parseShortRuleset('allow.features')).toThrow(
      /missing feature name/,
    );
    expect(() => parseShortRuleset('allow.arch')).toThrow(/missing arch/);
  });
});
