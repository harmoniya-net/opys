import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { RuleAction, RuleOsName, RuleSetSchema } from '../lib';
import { LINUX, OSX, WINDOWS_10, WINDOWS_7, help } from './fixtures';

describe('RuleSet', () => {
  test('empty', () => {
    const rules = Schema.decodeSync(RuleSetSchema)([]);
    const { os, ok, feats } = help(rules);

    expect(os(LINUX)).toBe(true);
    expect(os(WINDOWS_10)).toBe(true);
    expect(os(OSX)).toBe(true);

    expect(ok()).toBe(true);
    expect(feats(['some_random_feature', 'is_demo_user'])).toBe(true);
    expect(feats(['some_random_feature'])).toBe(true);
    expect(
      feats(['some_random_feature', 'is_demo_user', 'high_resolution']),
    ).toBe(true);
  });

  test('everything_except_osx', () => {
    const rules = Schema.decodeSync(RuleSetSchema)([
      {
        action: RuleAction.Allow,
      },
      {
        action: RuleAction.Disallow,
        os: {
          name: RuleOsName.Osx,
        },
      },
    ]);
    const { os } = help(rules);

    expect(os(OSX)).toBe(false);
    expect(os(LINUX)).toBe(true);
    expect(os(WINDOWS_10)).toBe(true);
  });

  test('windows_10_only', () => {
    const rules = Schema.decodeSync(RuleSetSchema)([
      {
        action: RuleAction.Allow,
        os: {
          name: RuleOsName.Windows,
          version: '^10\\.',
        },
      },
    ]);
    const { os } = help(rules);

    expect(os(WINDOWS_10)).toBe(true);
    expect(os(WINDOWS_7)).toBe(false);
    expect(os(OSX)).toBe(false);
    expect(os(LINUX)).toBe(false);
  });

  test('with_features', () => {
    const rules = Schema.decodeSync(RuleSetSchema)([
      {
        action: RuleAction.Allow,
        features: {
          is_demo_user: true,
        },
      },
    ]);
    const { os, feats } = help(rules);

    expect(feats(['some_random_feature', 'is_demo_user'])).toBe(true);
    expect(feats(['some_random_feature'])).toBe(false);
    expect(os(LINUX)).toBe(false);
  });

  test('both_features', () => {
    const rules = Schema.decodeSync(RuleSetSchema)([
      {
        action: RuleAction.Allow,
        features: {
          is_demo_user: true,
          high_resolution: true,
        },
      },
    ]);
    const { feats } = help(rules);

    expect(feats(['high_resolution', 'is_demo_user'])).toBe(true);
    expect(feats(['is_demo_user'])).toBe(false);
  });

  test('feature_excludes', () => {
    const rules = Schema.decodeSync(RuleSetSchema)([
      {
        action: RuleAction.Allow,
        features: {
          is_demo_user: true,
          high_resolution: false,
        },
      },
    ]);
    const { ok, feats } = help(rules);

    expect(ok()).toBe(false);
    expect(feats(['is_demo_user'])).toBe(true);
    expect(feats(['is_demo_user', 'high_resolution'])).toBe(false);
  });

  test('single rule', () => {
    const rules = Schema.decodeSync(RuleSetSchema)([
      { action: RuleAction.Allow },
    ]);
    expect(help(rules).ok()).toBe(true);
  });
});
