import { describe, expect, test } from 'bun:test';
import { InlineRulesetSchema, RuleAction, RuleOsName } from '../lib';
import { LINUX, OSX, WINDOWS_10, WINDOWS_7, help } from './fixtures';

describe('Shorthand', () => {
  test('shorthand', () => {
    const allow = InlineRulesetSchema.decode('allow');
    expect(help(allow).ok()).toBe(true);

    const disallow = InlineRulesetSchema.decode('disallow');
    expect(help(disallow).ok()).toBe(false);

    const allow_linux = InlineRulesetSchema.decode(['allow.os.linux']);
    expect(help(allow_linux).os(LINUX)).toBe(true);

    const allow_windows = InlineRulesetSchema.decode(['allow.os.windows']);
    expect(help(allow_windows).os(WINDOWS_10)).toBe(true);

    const allow_osx = InlineRulesetSchema.decode(['allow.os.osx']);
    expect(help(allow_osx).os(OSX)).toBe(true);

    const disallow_linux = InlineRulesetSchema.decode(['disallow.os.linux']);
    expect(help(disallow_linux).os(LINUX)).toBe(false);

    const disallow_windows = InlineRulesetSchema.decode([
      'disallow.os.windows',
    ]);
    expect(help(disallow_windows).os(WINDOWS_10)).toBe(false);

    const disallow_osx = InlineRulesetSchema.decode(['disallow.os.osx']);
    expect(help(disallow_osx).os(OSX)).toBe(false);

    const allow_features = InlineRulesetSchema.decode([
      'allow.features.is_demo_user',
    ]);
    expect(help(allow_features).feats(['is_demo_user'])).toBe(true);

    const disallow_features = InlineRulesetSchema.decode([
      'disallow.features.is_demo_user',
    ]);
    expect(help(disallow_features).feats(['is_demo_user'])).toBe(false);

    expect(() => InlineRulesetSchema.decode(['allow.os.dos'])).toThrow();

    const allow_windows_10 = InlineRulesetSchema.decode([
      'allow.os.windows@^10\\.',
    ]);
    expect(help(allow_windows_10).os(WINDOWS_10)).toBe(true);
    expect(help(allow_windows_10).os(WINDOWS_7)).toBe(false);

    const allow_osx_11 = InlineRulesetSchema.decode(['allow.os.osx@^11']);
    expect(help(allow_osx_11).os(OSX)).toBe(true);
    expect(help(allow_osx_11).os(LINUX)).toBe(false);

    const allow_x64 = InlineRulesetSchema.decode(['allow.arch.x86_64']);
    expect(help(allow_x64).os(LINUX)).toBe(true);
    expect(help(allow_x64).os(WINDOWS_10)).toBe(true);
    expect(help(allow_x64).os(OSX)).toBe(false);

    const allow_arm64 = InlineRulesetSchema.decode(['allow.arch.aarch64']);
    expect(help(allow_arm64).os(OSX)).toBe(true);
    expect(help(allow_arm64).os(LINUX)).toBe(false);

    const ruleset = InlineRulesetSchema.decode(['disallow.os.osx', 'allow']);
    expect(help(ruleset).os(OSX)).toBe(false);
    expect(help(ruleset).os(LINUX)).toBe(true);
    expect(help(ruleset).os(WINDOWS_10)).toBe(true);

    const versionRuleset = InlineRulesetSchema.decode(['allow.os.windows@^10']);
    expect(help(versionRuleset).os(WINDOWS_10)).toBe(true);
    expect(help(versionRuleset).os(WINDOWS_7)).toBe(false);

    const archRuleset = InlineRulesetSchema.decode([
      'disallow.arch.aarch64',
      'allow',
    ]);
    expect(help(archRuleset).os(OSX)).toBe(false);
    expect(help(archRuleset).os(LINUX)).toBe(true);

    const disallowVersion = InlineRulesetSchema.decode([
      'disallow.os.windows@^7\\.0\\.\\d+$',
    ]);
    expect(help(disallowVersion).os(WINDOWS_7)).toBe(false);
    expect(help(disallowVersion).os(WINDOWS_10)).toBe(true);

    const matchAll = InlineRulesetSchema.decode([
      'allow.arch.x86_64',
      'allow.os.linux',
    ]);
    expect(help(matchAll).os(LINUX)).toBe(true);
    expect(help(matchAll).os(WINDOWS_10)).toBe(false);

    expect(() => InlineRulesetSchema.decode(['allow.os.dos'])).toThrow();
    expect(() => InlineRulesetSchema.decode(['allow.unknown.type'])).toThrow();
    expect(() => InlineRulesetSchema.decode(['allow.os'])).toThrow(
      'missing OS name',
    );
    expect(() => InlineRulesetSchema.decode(['allow.features'])).toThrow(
      'missing feature name',
    );

    const mixed = InlineRulesetSchema.decode([
      'disallow.arch.aarch64',
      { action: RuleAction.Allow, os: { name: RuleOsName.Osx } },
    ]);
    expect(help(mixed).os(OSX)).toBe(false);
    expect(help(mixed).os(LINUX)).toBe(false);
  });
});
