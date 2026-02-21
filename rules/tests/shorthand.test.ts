import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { RuleAction, RuleOsName, RulexSetSchema } from '../lib';
import { LINUX, OSX, WINDOWS_10, WINDOWS_7, help } from './fixtures';

describe('Shorthand', () => {
  test('shorthand', () => {
    const decode = Schema.decodeSync(RulexSetSchema);

    const allow = decode('allow');
    expect(help(allow).ok()).toBe(true);

    const disallow = decode('disallow');
    expect(help(disallow).ok()).toBe(false);

    const allow_linux = decode(['allow.os.linux']);
    expect(help(allow_linux).os(LINUX)).toBe(true);

    const allow_windows = decode(['allow.os.windows']);
    expect(help(allow_windows).os(WINDOWS_10)).toBe(true);

    const allow_osx = decode(['allow.os.osx']);
    expect(help(allow_osx).os(OSX)).toBe(true);

    const disallow_linux = decode(['disallow.os.linux']);
    expect(help(disallow_linux).os(LINUX)).toBe(false);

    const disallow_windows = decode(['disallow.os.windows']);
    expect(help(disallow_windows).os(WINDOWS_10)).toBe(false);

    const disallow_osx = decode(['disallow.os.osx']);
    expect(help(disallow_osx).os(OSX)).toBe(false);

    const allow_features = decode(['allow.features.is_demo_user']);
    expect(help(allow_features).feats(['is_demo_user'])).toBe(true);

    const disallow_features = decode(['disallow.features.is_demo_user']);
    expect(help(disallow_features).feats(['is_demo_user'])).toBe(false);

    expect(() => decode(['allow.os.dos'])).toThrow();

    const allow_windows_10 = decode(['allow.os.windows@^10']);
    expect(help(allow_windows_10).os(WINDOWS_10)).toBe(true);
    expect(help(allow_windows_10).os(WINDOWS_7)).toBe(false);

    const allow_osx_11 = decode(['allow.os.osx@^11']);
    expect(help(allow_osx_11).os(OSX)).toBe(true);
    expect(help(allow_osx_11).os(LINUX)).toBe(false);

    const allow_x64 = decode(['allow.arch.x86_64']);
    expect(help(allow_x64).os(LINUX)).toBe(true);
    expect(help(allow_x64).os(WINDOWS_10)).toBe(true);
    expect(help(allow_x64).os(OSX)).toBe(false);

    const allow_arm64 = decode(['allow.arch.aarch64']);
    expect(help(allow_arm64).os(OSX)).toBe(true);
    expect(help(allow_arm64).os(LINUX)).toBe(false);

    const ruleset = decode(['disallow.os.osx', 'allow']);
    expect(help(ruleset).os(OSX)).toBe(false);
    expect(help(ruleset).os(LINUX)).toBe(true);
    expect(help(ruleset).os(WINDOWS_10)).toBe(true);

    const versionRuleset = decode(['allow.os.windows@^10']);
    expect(help(versionRuleset).os(WINDOWS_10)).toBe(true);
    expect(help(versionRuleset).os(WINDOWS_7)).toBe(false);

    const archRuleset = decode(['disallow.arch.aarch64', 'allow']);
    expect(help(archRuleset).os(OSX)).toBe(false); // OSX is aarch64 in fixtures
    expect(help(archRuleset).os(LINUX)).toBe(true); // Linux is x86_64

    const disallowVersion = decode(['disallow.os.windows@^7']);
    expect(help(disallowVersion).os(WINDOWS_7)).toBe(false);
    expect(help(disallowVersion).os(WINDOWS_10)).toBe(true);

    const matchAll = decode(['allow.arch.x86_64', 'allow.os.linux']);
    expect(help(matchAll).os(LINUX)).toBe(true);
    expect(help(matchAll).os(WINDOWS_10)).toBe(false); // fails os.linux check

    expect(() => decode(['allow.os.dos'])).toThrow();
    expect(() => decode(['allow.unknown.type'])).toThrow();
    expect(() => decode(['allow.os'])).toThrow('missing OS name');
    expect(() => decode(['allow.features'])).toThrow('missing feature name');

    const mixed = decode([
      'disallow.arch.aarch64',
      { action: RuleAction.Allow, os: { name: RuleOsName.Osx } },
    ]);
    expect(help(mixed).os(OSX)).toBe(false); // disallow by arch first
    expect(help(mixed).os(LINUX)).toBe(false); // not allowed
  });
});
