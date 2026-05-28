import { describe, expect, test } from 'vitest';
import {
  decodeManifest,
  encodeManifest,
  filterManifest,
  globBase,
  globToRegex,
  interpolate,
  parseManifest,
  resolveVars,
  resolvedArgs,
  satisfiesRuleset,
  type Launch,
  type Manifest,
} from '../../lib';

describe('@torba/core — napi boundary smoke', () => {
  test('parseManifest decodes JSON', () => {
    const m = parseManifest(
      JSON.stringify({
        vars: { root: '/x' },
        artifacts: [{ path: '${root}/a.jar', source: { url: 'https://a' } }],
      }),
    ) as { artifacts: unknown[]; vars: Record<string, string> };
    expect(m.artifacts).toHaveLength(1);
    expect(m.vars.root).toBe('/x');
  });

  test('encodeManifest round-trips a minimal wire', () => {
    const m = decodeManifest({
      vars: { root: '/x' },
      artifacts: [{ path: 'a', source: { string: 'x' } }],
    });
    const out = encodeManifest(m) as { vars: unknown; artifacts: unknown[] };
    expect(out.vars).toEqual({ root: '/x' });
    expect(out.artifacts).toHaveLength(1);
  });

  test('filterManifest drops platform-excluded artifacts', () => {
    const m = decodeManifest({
      artifacts: [
        {
          path: 'linux.jar',
          source: { string: 'x' },
          rules: 'allow.os.linux',
        },
        { path: 'any.jar', source: { string: 'x' } },
      ],
    });
    const out = filterManifest(m, {
      name: 'osx',
      version: '',
      arch: 'aarch64',
    });
    expect(out.artifacts).toHaveLength(1);
    expect(out.artifacts[0]!.path).toBe('any.jar');
  });

  test('resolveVars expands references', () => {
    expect(resolveVars({ a: 'hello', b: '${a} world' })).toMatchObject({
      a: 'hello',
      b: 'hello world',
    });
  });

  test('resolveVars detects circular refs', () => {
    expect(() => resolveVars({ a: '${b}', b: '${a}' })).toThrow(/Circular/);
  });

  test('interpolate leaves missing vars in place', () => {
    expect(interpolate('${missing}-x', {})).toBe('${missing}-x');
  });

  test('satisfiesRuleset evaluates shorthand', () => {
    expect(
      satisfiesRuleset(
        ['allow.os.linux'],
        { name: 'linux', version: '', arch: 'x86_64' },
        [],
      ),
    ).toBe(true);
    expect(
      satisfiesRuleset(
        ['allow.os.linux'],
        { name: 'osx', version: '', arch: 'aarch64' },
        [],
      ),
    ).toBe(false);
  });

  test('globToRegex round-trips through the napi source string', () => {
    expect(globToRegex('mods/*.jar').test('mods/foo.jar')).toBe(true);
    expect(globToRegex('mods/*.jar').test('mods/sub/foo.jar')).toBe(false);
  });

  test('globBase returns the prefix before wildcards', () => {
    expect(globBase('/home/x/mods/**/*.jar')).toBe('/home/x/mods');
  });

  test('resolvedArgs picks os-allowed entries', () => {
    // Use a manifest decode to normalize shorthand rules into a canonical Launch.
    const m = decodeManifest({
      launch: {
        command: 'java',
        workdir: '.',
        args: [
          '-Xmx2G',
          { value: '-XstartOnFirstThread', rules: 'allow.os.osx' },
          { value: '--linux-flag', rules: 'allow.os.linux' },
        ],
      },
    });
    const out = resolvedArgs(m.launch as Launch, {
      name: 'linux',
      version: '',
      arch: 'x86_64',
    });
    expect(out).toContain('-Xmx2G');
    expect(out).toContain('--linux-flag');
    expect(out).not.toContain('-XstartOnFirstThread');
  });

  test('decodeManifest tolerates a missing `artifacts` field', () => {
    const m = decodeManifest({});
    expect(m.artifacts).toEqual([]);
  });
});
