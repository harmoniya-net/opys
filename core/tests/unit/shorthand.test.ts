import { describe, expect, test } from 'vitest';
import { ShortRule, ShortRuleset } from '../../lib/shorthand';
import { LINUX, OSX, WINDOWS_10, WINDOWS_7, help } from './fixtures';

describe('ShortRule (single)', () => {
  test('decode "allow"', () => {
    expect(help(ShortRuleset.decode('allow')).ok()).toBe(true);
  });

  test('decode "disallow"', () => {
    expect(help(ShortRuleset.decode('disallow')).ok()).toBe(false);
  });

  test('roundtrip allow', () => {
    const rule = ShortRule.decode('allow');
    expect(ShortRule.encode(rule)).toBe('allow');
  });

  test('roundtrip allow.os.linux', () => {
    const rule = ShortRule.decode('allow.os.linux');
    expect(ShortRule.encode(rule)).toBe('allow.os.linux');
  });

  test('roundtrip allow.os.windows@^10\\.', () => {
    const rule = ShortRule.decode('allow.os.windows@^10\\.');
    expect(ShortRule.encode(rule)).toBe('allow.os.windows@^10\\.');
  });

  test('roundtrip allow.arch.x86_64', () => {
    const rule = ShortRule.decode('allow.arch.x86_64');
    expect(ShortRule.encode(rule)).toBe('allow.arch.x86_64');
  });

  test('roundtrip allow.features.is_demo_user', () => {
    const rule = ShortRule.decode('allow.features.is_demo_user');
    expect(ShortRule.encode(rule)).toBe('allow.features.is_demo_user');
  });

  test('throws on unknown OS name', () => {
    expect(() => ShortRule.decode('allow.os.dos')).toThrow();
  });

  test('throws on unknown rule type', () => {
    expect(() => ShortRule.decode('allow.unknown.type')).toThrow();
  });

  test('throws on missing OS name', () => {
    expect(() => ShortRule.decode('allow.os')).toThrow('missing OS name');
  });

  test('throws on missing feature name', () => {
    expect(() => ShortRule.decode('allow.features')).toThrow(
      'missing feature name',
    );
  });
});

describe('ShortRuleset', () => {
  test('allow all OSes', () => {
    const rules = ShortRuleset.decode('allow');
    expect(help(rules).os(LINUX)).toBe(true);
    expect(help(rules).os(OSX)).toBe(true);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
  });

  test('disallow all OSes', () => {
    expect(help(ShortRuleset.decode('disallow')).ok()).toBe(false);
  });

  test('allow.os.linux', () => {
    const rules = ShortRuleset.decode(['allow.os.linux']);
    expect(help(rules).os(LINUX)).toBe(true);
    expect(help(rules).os(WINDOWS_10)).toBe(false);
    expect(help(rules).os(OSX)).toBe(false);
  });

  test('allow.os.windows', () => {
    const rules = ShortRuleset.decode(['allow.os.windows']);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
    expect(help(rules).os(LINUX)).toBe(false);
  });

  test('allow.os.osx', () => {
    const rules = ShortRuleset.decode(['allow.os.osx']);
    expect(help(rules).os(OSX)).toBe(true);
    expect(help(rules).os(LINUX)).toBe(false);
  });

  test('disallow.os.linux', () => {
    const rules = ShortRuleset.decode(['disallow.os.linux']);
    expect(help(rules).os(LINUX)).toBe(false);
    expect(help(rules).os(OSX)).toBe(true);
  });

  test('allow.os.windows@^10\\. (version regex)', () => {
    const rules = ShortRuleset.decode(['allow.os.windows@^10\\.']);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
    expect(help(rules).os(WINDOWS_7)).toBe(false);
  });

  test('allow.features.is_demo_user', () => {
    const rules = ShortRuleset.decode(['allow.features.is_demo_user']);
    expect(help(rules).feats(['is_demo_user'])).toBe(true);
    expect(help(rules).feats(['other'])).toBe(false);
  });

  test('disallow.features.is_demo_user', () => {
    const rules = ShortRuleset.decode(['disallow.features.is_demo_user']);
    expect(help(rules).feats(['is_demo_user'])).toBe(false);
    expect(help(rules).feats(['other'])).toBe(true);
  });

  test('allow.arch.x86_64', () => {
    const rules = ShortRuleset.decode(['allow.arch.x86_64']);
    expect(help(rules).os(LINUX)).toBe(true);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
    expect(help(rules).os(OSX)).toBe(false); // OSX is aarch64
  });

  test('allow.arch.aarch64', () => {
    const rules = ShortRuleset.decode(['allow.arch.aarch64']);
    expect(help(rules).os(OSX)).toBe(true);
    expect(help(rules).os(LINUX)).toBe(false);
  });

  test('mixed: disallow osx then allow all → everything-except-osx', () => {
    const rules = ShortRuleset.decode(['disallow.os.osx', 'allow']);
    expect(help(rules).os(OSX)).toBe(false);
    expect(help(rules).os(LINUX)).toBe(true);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
  });

  test('mixed: disallow aarch64 then allow all → except aarch64', () => {
    const rules = ShortRuleset.decode(['disallow.arch.aarch64', 'allow']);
    expect(help(rules).os(OSX)).toBe(false);
    expect(help(rules).os(LINUX)).toBe(true);
  });

  test('mixed string + object rule', () => {
    const rules = ShortRuleset.decode([
      'disallow.arch.aarch64',
      { action: 'allow' as const, os: { name: 'osx' as const } },
    ]);
    expect(help(rules).os(OSX)).toBe(false);
    expect(help(rules).os(LINUX)).toBe(false);
  });

  test('version range: disallow.os.windows@^7\\.', () => {
    const rules = ShortRuleset.decode(['disallow.os.windows@^7\\.0\\.\\d+$']);
    expect(help(rules).os(WINDOWS_7)).toBe(false);
    expect(help(rules).os(WINDOWS_10)).toBe(true);
  });

  test('roundtrip single string', () => {
    expect(ShortRuleset.encode(ShortRuleset.decode('allow'))).toBe('allow');
  });

  test('roundtrip array', () => {
    const input = ['allow.os.linux', 'disallow.arch.aarch64'];
    expect(ShortRuleset.encode(ShortRuleset.decode(input))).toEqual(input);
  });
});
