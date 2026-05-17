import { describe, expect, it } from 'vitest';
import { sourceUrl, type Artifact, type Integrity } from '@torba/core';
import { applyOverrides } from '../../lib/overrides';

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
});
