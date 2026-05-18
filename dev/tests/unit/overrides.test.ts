import { describe, expect, it } from 'vitest';
import { sourceUrl, type Artifact, type Integrity } from '@torba/core';
import { applyOverrides, matchesSelector } from '../../lib/overrides';

const art = (path: string, integrity?: Integrity): Artifact => ({
  path,
  source: sourceUrl(`http://x/${path}`),
  rules: [],
  ...(integrity ? { integrity } : {}),
});

describe('applyOverrides', () => {
  it('returns artifacts unchanged with no overrides', () => {
    const arts = [art('a.jar'), art('b.jar')];
    expect(applyOverrides(arts, [])).toEqual(arts);
  });

  it('excludes matched artifacts', () => {
    const arts = [art('mods/realms.jar'), art('mods/jei.jar')];
    const out = applyOverrides(arts, [
      { match: '**/realms*.jar', exclude: true },
    ]);
    expect(out.map((a) => a.path)).toEqual(['mods/jei.jar']);
  });

  it('attaches shorthand rules to matched artifacts', () => {
    const out = applyOverrides(
      [art('mods/optifine.jar')],
      [{ match: '**/optifine*.jar', rules: 'allow.os.osx' }],
    );
    expect(out[0]!.rules).toEqual([{ action: 'allow', os: { name: 'osx' } }]);
  });

  it('clears integrity when integrity is null', () => {
    const out = applyOverrides(
      [art('options.txt', { sha1: 'abc' })],
      [{ match: '**/options.txt', integrity: null }],
    );
    expect(out[0]!.integrity).toBeUndefined();
  });

  it('matches with a predicate selector and applies in order', () => {
    const out = applyOverrides(
      [art('a.jar'), art('b.jar')],
      [{ match: (a) => a.path === 'a.jar', rules: 'allow.features.x' }],
    );
    expect(out[0]!.rules).toHaveLength(1);
    expect(out[1]!.rules).toHaveLength(0);
  });

  it('matches any glob in an array selector (OR)', () => {
    const out = applyOverrides(
      [art('mods/a.jar'), art('mods/b.jar'), art('mods/c.jar')],
      [{ match: ['**/a.jar', '**/c.jar'], exclude: true }],
    );
    expect(out.map((a) => a.path)).toEqual(['mods/b.jar']);
  });

  it('clears discovery alongside integrity when integrity is null', () => {
    const withDiscovery: Artifact = {
      ...art('options.txt', { sha1: 'abc' }),
      discovery: { size: { header: 'Content-Length' } },
    };
    const out = applyOverrides(
      [withDiscovery],
      [{ match: '**/options.txt', integrity: null }],
    );
    expect(out[0]!.integrity).toBeUndefined();
    expect(out[0]!.discovery).toBeUndefined();
  });

  it('later overrides see the effect of earlier ones', () => {
    const out = applyOverrides(
      [art('mods/x.jar')],
      [
        { match: '**/x.jar', rules: 'allow.os.linux' },
        { match: '**/x.jar', rules: 'allow.os.osx' },
      ],
    );
    expect(out[0]!.rules).toHaveLength(2);
  });
});

describe('matchesSelector', () => {
  it('matches a string glob against the artifact path', () => {
    expect(matchesSelector('mods/*.jar', art('mods/a.jar'))).toBe(true);
    expect(matchesSelector('mods/*.jar', art('cfg/a.txt'))).toBe(false);
  });

  it('matches an array selector as an OR of globs', () => {
    expect(matchesSelector(['a/*', 'b/*'], art('b/x'))).toBe(true);
  });

  it('delegates to a predicate selector', () => {
    expect(matchesSelector((a) => a.path.endsWith('.jar'), art('x.jar'))).toBe(
      true,
    );
  });
});
