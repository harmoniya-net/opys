import { describe, expect, it } from 'vitest';
import {
  RulesetSchema,
  satisfiesRuleset,
  emptyRuleset,
  satisfiesRule,
  satisfiesOs,
} from '../lib';
import { LINUX, OSX, WINDOWS_10, WINDOWS_7 } from './fixtures';

describe('satisfiesRule', () => {
  it('action-only allow rule always satisfies', () => {
    const rule = { action: 'allow' as const };
    expect(satisfiesRule(rule, LINUX)).toBe(true);
    expect(satisfiesRule(rule, WINDOWS_10)).toBe(true);
    expect(satisfiesRule(rule, OSX)).toBe(true);
  });

  it('action-only disallow rule never satisfies', () => {
    const rule = { action: 'disallow' as const };
    expect(satisfiesRule(rule, LINUX)).toBe(false);
    expect(satisfiesRule(rule, WINDOWS_10)).toBe(false);
  });

  it('Allow + OS: satisfies only matching OS', () => {
    const rule = { action: 'allow' as const, os: { name: 'linux' as const } };
    expect(satisfiesRule(rule, LINUX)).toBe(true);
    expect(satisfiesRule(rule, OSX)).toBe(false);
    expect(satisfiesRule(rule, WINDOWS_10)).toBe(false);
  });

  it('Disallow + OS: fails only on that OS', () => {
    const rule = { action: 'disallow' as const, os: { name: 'osx' as const } };
    expect(satisfiesRule(rule, OSX)).toBe(false);
    expect(satisfiesRule(rule, LINUX)).toBe(true);
    expect(satisfiesRule(rule, WINDOWS_10)).toBe(true);
  });
});

describe('satisfiesOs', () => {
  it('matches by name only when no version', () => {
    expect(satisfiesOs({ name: 'linux' }, LINUX)).toBe(true);
    expect(satisfiesOs({ name: 'linux' }, OSX)).toBe(false);
  });

  it('version regex must match', () => {
    expect(
      satisfiesOs({ name: 'windows', version: '^10\\.' }, WINDOWS_10),
    ).toBe(true);
    expect(satisfiesOs({ name: 'windows', version: '^10\\.' }, WINDOWS_7)).toBe(
      false,
    );
  });

  it('arch-only filter', () => {
    expect(satisfiesOs({ arch: 'aarch64' }, OSX)).toBe(true);
    expect(satisfiesOs({ arch: 'aarch64' }, LINUX)).toBe(false);
  });
});

describe('Ruleset composed edge cases', () => {
  it('empty ruleset satisfies vacuously', () => {
    expect(satisfiesRuleset(emptyRuleset(), LINUX)).toBe(true);
    expect(satisfiesRuleset(emptyRuleset(), WINDOWS_10)).toBe(true);
  });

  it('Allow + Disallow: every rule must pass', () => {
    const rs = RulesetSchema.parse([
      { action: 'allow', os: { name: 'linux' } },
      { action: 'disallow' },
    ]);
    expect(satisfiesRuleset(rs, LINUX)).toBe(false);
  });

  it('multiple allows act as AND', () => {
    const rs = RulesetSchema.parse([
      { action: 'allow', os: { name: 'linux' } },
      { action: 'allow', os: { name: 'osx' } },
    ]);
    expect(satisfiesRuleset(rs, LINUX)).toBe(false);
    expect(satisfiesRuleset(rs, OSX)).toBe(false);
  });

  it('arch-only rule combined with name-only rule acts as AND', () => {
    const rs = RulesetSchema.parse([
      { action: 'allow', os: { arch: 'x86_64' } },
      { action: 'allow', os: { name: 'linux' } },
    ]);
    expect(satisfiesRuleset(rs, LINUX)).toBe(true);
    expect(satisfiesRuleset(rs, OSX)).toBe(false); // OSX is aarch64
  });

  it('throws on an invalid OS version regex', () => {
    expect(() => satisfiesOs({ version: '(' }, LINUX)).toThrow(
      /Invalid OS version pattern/,
    );
  });

  it('satisfiesOs ignores absent fields', () => {
    expect(satisfiesOs({}, LINUX)).toBe(true);
  });

  it('satisfiesRule treats a bare allow/disallow with no constraints', () => {
    expect(satisfiesRule({ action: 'allow' }, LINUX)).toBe(true);
    expect(satisfiesRule({ action: 'disallow' }, LINUX)).toBe(false);
  });
});
