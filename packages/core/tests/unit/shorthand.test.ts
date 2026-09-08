import { describe, expect, test } from 'vitest';
import { parseShortRuleset, sourceUrl, valValues } from '../../lib';
import type { Artifact, ConditionalVal, Ruleset, Val } from '../../lib';

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

describe('Rule / Ruleset — the manifest spelling', () => {
  // These assertions are mostly for the compiler: before `Ruleset` widened,
  // every one of these shapes was a type error, even though the manifest
  // format has always accepted them and configs have always written them.
  test('accepts a bare shorthand string wherever a manifest takes rules', () => {
    const artifact: Artifact = {
      path: 'a.jar',
      source: sourceUrl('https://x/a.jar'),
      rules: 'allow.os.linux',
    };
    expect(parseShortRuleset(artifact.rules ?? [])).toEqual([
      { action: 'allow', os: { name: 'linux' } },
    ]);
  });

  test('accepts the expanded Mojang object, and a mix of both', () => {
    const rules: Ruleset = [
      'allow.os.linux',
      { action: 'disallow', features: { demo: true } },
    ];
    expect(parseShortRuleset(rules)).toEqual([
      { action: 'allow', os: { name: 'linux' } },
      { action: 'disallow', features: { demo: true } },
    ]);
  });

  test('lets an artifact omit rules entirely', () => {
    const artifact: Artifact = {
      path: 'a.jar',
      source: sourceUrl('https://x/a.jar'),
    };
    expect(artifact.rules).toBeUndefined();
  });

  test('accepts a conditional var arm written in shorthand', () => {
    const arm: ConditionalVal = { value: '/x', rules: 'allow.os.osx' };
    expect(parseShortRuleset(arm.rules ?? [])).toEqual([
      { action: 'allow', os: { name: 'osx' } },
    ]);
  });
});

describe('Val — the manifest spelling', () => {
  test('a bare string is a Val, and valValues reads it', () => {
    const val: Val = '-Xmx2G';
    expect(valValues(val)).toEqual(['-Xmx2G']);
  });

  test('a single-string value needs no array', () => {
    const val: Val = { value: '--demo', rules: 'allow.os.linux' };
    expect(valValues(val)).toEqual(['--demo']);
  });

  test('a multi-value arm keeps every value', () => {
    const val: Val = { value: ['-XstartOnFirstThread', '-Xdock:name=MC'] };
    expect(valValues(val)).toEqual(['-XstartOnFirstThread', '-Xdock:name=MC']);
  });
});
