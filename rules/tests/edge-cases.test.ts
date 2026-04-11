import { describe, expect, it } from 'vitest';
import { RuleAction, RuleOsName } from '../lib';
import { Ruleset } from '../lib/rules/ruleset';
import { Rule } from '../lib/rules/rule';
import { RuleOs, RuleOsArch } from '../lib/rules/os';
import { LINUX, OSX, WINDOWS_10, WINDOWS_7 } from './fixtures';

describe('Rule.satisfies', () => {
  it('action-only Allow rule always satisfies', () => {
    const rule = Rule.CODEC.decode({ action: RuleAction.Allow });
    expect(rule.satisfies(LINUX)).toBe(true);
    expect(rule.satisfies(WINDOWS_10)).toBe(true);
    expect(rule.satisfies(OSX)).toBe(true);
  });

  it('action-only Disallow rule never satisfies', () => {
    const rule = Rule.CODEC.decode({ action: RuleAction.Disallow });
    expect(rule.satisfies(LINUX)).toBe(false);
    expect(rule.satisfies(WINDOWS_10)).toBe(false);
  });

  it('Allow + OS: satisfies only matching OS', () => {
    const rule = Rule.allowOs(RuleOsName.Linux);
    expect(rule.satisfies(LINUX)).toBe(true);
    expect(rule.satisfies(OSX)).toBe(false);
    expect(rule.satisfies(WINDOWS_10)).toBe(false);
  });

  it('Disallow + OS: fails only on that OS', () => {
    const rule = Rule.CODEC.decode({
      action: RuleAction.Disallow,
      os: { name: RuleOsName.Osx },
    });
    expect(rule.satisfies(OSX)).toBe(false);
    expect(rule.satisfies(LINUX)).toBe(true);
    expect(rule.satisfies(WINDOWS_10)).toBe(true);
  });
});

describe('RuleOs.satisfies', () => {
  it('matches by name only when no version or arch', () => {
    const os = RuleOs.CODEC.decode({ name: RuleOsName.Linux });
    expect(os.satisfies(LINUX)).toBe(true);
    expect(os.satisfies(OSX)).toBe(false);
  });

  it('version regex must match', () => {
    const os = RuleOs.CODEC.decode({
      name: RuleOsName.Windows,
      version: '^10\\.',
    });
    expect(os.satisfies(WINDOWS_10)).toBe(true);
    expect(os.satisfies(WINDOWS_7)).toBe(false);
  });

  it('arch filter works', () => {
    const os = RuleOs.CODEC.decode({ name: RuleOsName.Linux, arch: 'x86_64' });
    expect(os.satisfies(LINUX)).toBe(true); // LINUX is x86_64
    expect(os.satisfies(OSX)).toBe(false); // OSX is aarch64
  });

  it('arch without name still filters by arch', () => {
    const os = RuleOs.CODEC.decode({ arch: 'aarch64' });
    expect(os.satisfies(OSX)).toBe(true); // OSX is aarch64
    expect(os.satisfies(LINUX)).toBe(false); // LINUX is x86_64
  });
});

describe('Ruleset composed edge cases', () => {
  it('empty ruleset satisfies vacuously', () => {
    expect(Ruleset.empty().satisfies(LINUX)).toBe(true);
    expect(Ruleset.empty().satisfies(WINDOWS_10)).toBe(true);
  });

  it('Allow + Disallow in sequence: first failing stops evaluation', () => {
    // Allow linux, then disallow everything → linux still fails because disallow matches
    const rs = Ruleset.CODEC.decode([
      { action: RuleAction.Allow, os: { name: RuleOsName.Linux } },
      { action: RuleAction.Disallow },
    ]);
    // Allow linux passes, but Disallow (unconditional) fails → result false
    expect(rs.satisfies(LINUX)).toBe(false);
  });

  it('multiple allows act as AND — both must pass', () => {
    // Rule 1 allows Linux, Rule 2 allows OSX — no platform satisfies both
    const rs = Ruleset.CODEC.decode([
      { action: RuleAction.Allow, os: { name: RuleOsName.Linux } },
      { action: RuleAction.Allow, os: { name: RuleOsName.Osx } },
    ]);
    expect(rs.satisfies(LINUX)).toBe(false); // Rule 2 (osx) fails
    expect(rs.satisfies(OSX)).toBe(false); // Rule 1 (linux) fails
  });

  it('arch-only rule combined with name-only rule acts as AND', () => {
    // Rule 1 allows x86_64, Rule 2 allows linux → only linux/x86_64 passes both
    const rs = Ruleset.CODEC.decode([
      { action: RuleAction.Allow, os: { arch: RuleOsArch.X86_64 } },
      { action: RuleAction.Allow, os: { name: RuleOsName.Linux } },
    ]);
    expect(rs.satisfies(LINUX)).toBe(true); // LINUX is x86_64
    expect(rs.satisfies(OSX)).toBe(false); // OSX is aarch64, fails Rule 1
  });
});
