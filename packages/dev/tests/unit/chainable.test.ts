import { describe, expect, it } from 'vitest';
import {
  sourceFile,
  sourceUrl,
  type Artifact,
  type Discovery,
  type Integrity,
} from '@opys/core';
import {
  definePlugin,
  type Contribution,
  type OpysPlugin,
} from '../../lib/plugin';
import { matchesSelector } from '../../lib/selector';

const ctx = { log: () => {}, configDir: '/tmp', mode: '' };

const art = (path: string, extra: Partial<Artifact> = {}): Artifact => ({
  path,
  source: sourceUrl(`http://x/${path}`),
  rules: [],
  ...extra,
});

/** A fixed-output plugin to post-process. */
const fake = (contribution: Contribution) =>
  definePlugin({ name: 'fake', build: () => contribution });

const built = async (plugin: OpysPlugin): Promise<Artifact[]> =>
  (await plugin.build(ctx)).artifacts ?? [];

describe('matchesSelector', () => {
  it('matches a single glob, an OR-list, and a predicate', () => {
    const a = art('mods/jei.jar');
    expect(matchesSelector('**/jei*.jar', a)).toBe(true);
    expect(matchesSelector(['**/none', '**/jei*.jar'], a)).toBe(true);
    expect(matchesSelector((x) => x.path.endsWith('.jar'), a)).toBe(true);
    expect(matchesSelector('**/other.jar', a)).toBe(false);
  });
});

describe('ChainablePlugin', () => {
  it('passes artifacts through untouched with no methods', async () => {
    const arts = [art('a.jar'), art('b.jar')];
    expect(await built(fake({ artifacts: arts }))).toEqual(arts);
  });

  it('exclude drops matched artifacts (glob, list, predicate)', async () => {
    const base = fake({
      artifacts: [art('mods/realms.jar'), art('mods/jei.jar')],
    });
    expect(
      (await built(base.exclude('**/realms*.jar'))).map((a) => a.path),
    ).toEqual(['mods/jei.jar']);
    expect(
      (await built(base.exclude((a) => a.path.includes('jei')))).map(
        (a) => a.path,
      ),
    ).toEqual(['mods/realms.jar']);
  });

  it('addRule appends shorthand rules, stacking with existing ones', async () => {
    const base = fake({
      artifacts: [art('mods/optifine.jar', { rules: [{ action: 'allow' }] })],
    });
    const [a] = await built(base.addRule('**/optifine*.jar', 'allow.os.osx'));
    expect(a!.rules).toEqual([
      { action: 'allow' },
      { action: 'allow', os: { name: 'osx' } },
    ]);
  });

  it('removeIntegrity clears both integrity and discovery', async () => {
    const integrity: Integrity = { sha1: 'abc' };
    const discovery: Discovery = {};
    const base = fake({
      artifacts: [art('mods/a.jar', { integrity, discovery })],
    });
    const [a] = await built(base.removeIntegrity('**/*.jar'));
    expect(a!.integrity).toBeUndefined();
    expect(a!.discovery).toBeUndefined();
  });

  it('updateMany shallow-merges a partial into every match', async () => {
    const base = fake({ artifacts: [art('mods/a.jar'), art('mods/b.jar')] });
    const out = await built(
      base.updateMany('**/*.jar', { source: sourceFile('/local/x') }),
    );
    expect(out.every((a) => a.source.kind === 'file')).toBe(true);
  });

  it('updateMany accepts a function of the matched artifact', async () => {
    const base = fake({ artifacts: [art('mods/jei.jar')] });
    const [a] = await built(
      base.updateMany('**/*.jar', (x) => ({
        source: sourceUrl(`https://mirror/${x.path}`),
      })),
    );
    expect(a!.source).toEqual({
      kind: 'url',
      url: 'https://mirror/mods/jei.jar',
    });
  });

  it('updateFirst patches only the first matching artifact', async () => {
    const base = fake({ artifacts: [art('mods/a.jar'), art('mods/b.jar')] });
    const out = await built(base.updateFirst('**/*.jar', { size: 99 }));
    expect(out.map((a) => a.size)).toEqual([99, undefined]);
  });

  it('chains left-to-right; a later op sees an earlier one', async () => {
    const base = fake({ artifacts: [art('mods/a.jar'), art('keep.txt')] });
    const out = await built(
      base.exclude('**/*.txt').addRule('**/*.jar', 'allow.os.linux'),
    );
    expect(out.map((a) => a.path)).toEqual(['mods/a.jar']);
    expect(out[0]!.rules).toEqual([{ action: 'allow', os: { name: 'linux' } }]);
  });

  it('is immutable — the original plugin is unaffected by a chained call', async () => {
    const base = fake({ artifacts: [art('a.jar'), art('b.jar')] });
    const chained = base.exclude('**/*');
    expect((await built(base)).map((a) => a.path)).toEqual(['a.jar', 'b.jar']);
    expect(await built(chained)).toEqual([]);
  });

  it('passes vars and launch through untouched', async () => {
    const base = fake({
      artifacts: [art('a.jar')],
      vars: { root: '/r' },
      launch: { jvmArgs: '-Xmx2G' },
    });
    const out = await base.exclude('**/none').build(ctx);
    expect(out.vars).toEqual({ root: '/r' });
    expect(out.launch).toEqual({ jvmArgs: '-Xmx2G' });
  });

  it('is a no-op on a plugin that contributes no artifacts', async () => {
    const out = await definePlugin({
      name: 'varsOnly',
      build: () => ({ vars: { x: '1' } }),
    })
      .exclude('**/*')
      .build(ctx);
    expect(out.artifacts).toBeUndefined();
    expect(out.vars).toEqual({ x: '1' });
  });
});
