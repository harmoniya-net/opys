import { describe, expect, test } from 'vitest';
import {
  parseShortRule,
  encodeShortRule,
  parseShortRuleset,
  encodeShortRuleset,
} from '../../lib/shorthand';
import { LINUX, OSX, WINDOWS_10, WINDOWS_7, help } from './fixtures';

describe('ShortRule (single)', () => {
  test('decode "allow"', () => {
    expect(help(parseShortRuleset('allow')).ok()).toBe(true);
  });

  test('decode "disallow"', () => {
    expect(help(parseShortRuleset('disallow')).ok()).toBe(false);
  });

  test('roundtrip allow', () => {
    const rule = parseShortRule('allow');
    expect(encodeShortRule(rule)).toBe('allow');
  });

  test('roundtrip allow.os.linux', () => {
    const rule = parseShortRule('allow.os.linux');
    expect(encodeShortRule(rule)).toBe('allow.os.linux');
  });

  test('roundtrip allow.os.windows@^10\\.', () => {
    const rule = parseShortRule('allow.os.windows@^10\\.');
    expect(encodeShortRule(rule)).toBe('allow.os.windows@^10\\.');
  });

  test('roundtrip allow.arch.x86_64', () => {
    const rule = parseShortRule('allow.arch.x86_64');
    expect(encodeShortRule(rule)).toBe('allow.arch.x86_64');
  });

  test('roundtrip allow.features.is_demo_user', () => {
    const rule = parseShortRule('allow.features.is_demo_user');
    expect(encodeShortRule(rule)).toBe('allow.features.is_demo_user');
  });

  test('throws on unknown OS name', () => {
    expect(() => parseShortRule('allow.os.dos')).toThrow();
  });

  test('throws on unknown rule type', () => {
    expect(() => parseShortRule('allow.unknown.type')).toThrow();
  });

  test('throws on missing OS name', () => {
    expect(() => parseShortRule('allow.os')).toThrow('missing OS name');
  });

  test('throws on missing feature name', () => {
    expect(() => parseShortRule('allow.features')).toThrow(
      'missing feature name',
    );
  });

  test('throws on an unknown action', () => {
    expect(() => parseShortRule('maybe.os.linux')).toThrow(
      "Unknown action 'maybe'",
    );
  });

  test('throws on missing arch', () => {
    expect(() => parseShortRule('allow.arch')).toThrow('missing arch');
  });

  test('passes a rule object through unchanged', () => {
    const rule = { action: 'allow' as const, os: { name: 'linux' as const } };
    expect(parseShortRule(rule)).toEqual(rule);
  });

  test('encodes a multi-feature rule to its bare action', () => {
    expect(
      encodeShortRule({ action: 'allow', features: { a: true, b: true } }),
    ).toBe('allow');
  });
});

describe('ShortRuleset', () => {
  test('allow all OSes', () => {
    const rules = parseShortRuleset('allow');
    expect(help(rules).os(LINUX)).toBe(true);
    expect(help(rules).os(OSX)).toBe(true);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
  });

  test('disallow all OSes', () => {
    expect(help(parseShortRuleset('disallow')).ok()).toBe(false);
  });

  test('allow.os.linux', () => {
    const rules = parseShortRuleset(['allow.os.linux']);
    expect(help(rules).os(LINUX)).toBe(true);
    expect(help(rules).os(WINDOWS_10)).toBe(false);
    expect(help(rules).os(OSX)).toBe(false);
  });

  test('allow.os.windows', () => {
    const rules = parseShortRuleset(['allow.os.windows']);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
    expect(help(rules).os(LINUX)).toBe(false);
  });

  test('allow.os.osx', () => {
    const rules = parseShortRuleset(['allow.os.osx']);
    expect(help(rules).os(OSX)).toBe(true);
    expect(help(rules).os(LINUX)).toBe(false);
  });

  test('disallow.os.linux', () => {
    const rules = parseShortRuleset(['disallow.os.linux']);
    expect(help(rules).os(LINUX)).toBe(false);
    expect(help(rules).os(OSX)).toBe(true);
  });

  test('allow.os.windows@^10\\. (version regex)', () => {
    const rules = parseShortRuleset(['allow.os.windows@^10\\.']);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
    expect(help(rules).os(WINDOWS_7)).toBe(false);
  });

  test('allow.features.is_demo_user', () => {
    const rules = parseShortRuleset(['allow.features.is_demo_user']);
    expect(help(rules).feats(['is_demo_user'])).toBe(true);
    expect(help(rules).feats(['other'])).toBe(false);
  });

  test('disallow.features.is_demo_user', () => {
    const rules = parseShortRuleset(['disallow.features.is_demo_user']);
    expect(help(rules).feats(['is_demo_user'])).toBe(false);
    expect(help(rules).feats(['other'])).toBe(true);
  });

  test('allow.arch.x86_64', () => {
    const rules = parseShortRuleset(['allow.arch.x86_64']);
    expect(help(rules).os(LINUX)).toBe(true);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
    expect(help(rules).os(OSX)).toBe(false); // OSX is aarch64
  });

  test('allow.arch.aarch64', () => {
    const rules = parseShortRuleset(['allow.arch.aarch64']);
    expect(help(rules).os(OSX)).toBe(true);
    expect(help(rules).os(LINUX)).toBe(false);
  });

  test('mixed: disallow osx then allow all → everything-except-osx', () => {
    const rules = parseShortRuleset(['disallow.os.osx', 'allow']);
    expect(help(rules).os(OSX)).toBe(false);
    expect(help(rules).os(LINUX)).toBe(true);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
  });

  test('mixed: disallow aarch64 then allow all → except aarch64', () => {
    const rules = parseShortRuleset(['disallow.arch.aarch64', 'allow']);
    expect(help(rules).os(OSX)).toBe(false);
    expect(help(rules).os(LINUX)).toBe(true);
  });

  test('mixed string + object rule', () => {
    const rules = parseShortRuleset([
      'disallow.arch.aarch64',
      { action: 'allow' as const, os: { name: 'osx' as const } },
    ]);
    expect(help(rules).os(OSX)).toBe(false);
    expect(help(rules).os(LINUX)).toBe(false);
  });

  test('version range: disallow.os.windows@^7\\.', () => {
    const rules = parseShortRuleset(['disallow.os.windows@^7\\.0\\.\\d+$']);
    expect(help(rules).os(WINDOWS_7)).toBe(false);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
  });

  test('roundtrip single string', () => {
    expect(encodeShortRuleset(parseShortRuleset('allow'))).toBe('allow');
  });

  test('roundtrip array', () => {
    const input = ['allow.os.linux', 'disallow.arch.aarch64'];
    expect(encodeShortRuleset(parseShortRuleset(input))).toEqual(input);
  });
});
