import { describe, expect, test } from 'vitest';
import {
  RulesetSchema,
  emptyRuleset,
  allowOsRuleset,
  satisfiesRuleset,
} from '../lib';
import { LINUX, OSX, WINDOWS_10, WINDOWS_7, help } from './fixtures';

describe('RuleSet', () => {
  test('empty', () => {
    const rules = RulesetSchema.parse([]);
    const { os, ok, feats } = help(rules);
    expect(os(LINUX)).toBe(true);
    expect(os(OSX)).toBe(true);
    expect(os(WINDOWS_10)).toBe(true);
    expect(ok()).toBe(true);
    expect(feats(['any_feature'])).toBe(true);
  });

  test('everything_except_osx', () => {
    const rules = RulesetSchema.parse([
      { action: 'allow' },
      { action: 'disallow', os: { name: 'osx' } },
    ]);
    const { os } = help(rules);
    expect(os(OSX)).toBe(false);
    expect(os(LINUX)).toBe(true);
    expect(os(WINDOWS_10)).toBe(true);
  });

  test('windows_10_only', () => {
    const rules = RulesetSchema.parse([
      { action: 'allow', os: { name: 'windows', version: '^10\\.' } },
    ]);
    const { os } = help(rules);
    expect(os(WINDOWS_10)).toBe(true);
    expect(os(WINDOWS_7)).toBe(false);
    expect(os(OSX)).toBe(false);
    expect(os(LINUX)).toBe(false);
  });

  test('with_features', () => {
    const rules = RulesetSchema.parse([
      { action: 'allow', features: { is_demo_user: true } },
    ]);
    const { os, feats } = help(rules);
    expect(feats(['some_random_feature', 'is_demo_user'])).toBe(true);
    expect(feats(['some_random_feature'])).toBe(false);
    expect(os(LINUX)).toBe(false);
  });

  test('both_features', () => {
    const rules = RulesetSchema.parse([
      {
        action: 'allow',
        features: { is_demo_user: true, high_resolution: true },
      },
    ]);
    const { feats } = help(rules);
    expect(feats(['high_resolution', 'is_demo_user'])).toBe(true);
    expect(feats(['is_demo_user'])).toBe(false);
  });

  test('feature_excludes', () => {
    const rules = RulesetSchema.parse([
      {
        action: 'allow',
        features: { is_demo_user: true, high_resolution: false },
      },
    ]);
    const { ok, feats } = help(rules);
    expect(ok()).toBe(false);
    expect(feats(['is_demo_user'])).toBe(true);
    expect(feats(['is_demo_user', 'high_resolution'])).toBe(false);
  });

  test('single rule', () => {
    const rules = RulesetSchema.parse([{ action: 'allow' }]);
    expect(help(rules).ok()).toBe(true);
  });

  test('emptyRuleset helper', () => {
    expect(satisfiesRuleset(emptyRuleset(), LINUX)).toBe(true);
  });

  test('allowOsRuleset helper matches only the named OS', () => {
    const rules = allowOsRuleset('windows');
    expect(satisfiesRuleset(rules, WINDOWS_10)).toBe(true);
    expect(satisfiesRuleset(rules, LINUX)).toBe(false);
    expect(satisfiesRuleset(rules, OSX)).toBe(false);
  });
});
