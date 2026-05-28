import { describe, expect, it } from 'vitest';
import { sourceUrl, type Artifact } from '@lanka/core';
import { defineArtifactPlugin } from '../../lib/artifact-plugin';
import type { BuildContext, Contribution, LankaPlugin } from '../../lib/plugin';

const ctx: BuildContext = { log: () => {}, configDir: '/tmp', mode: '' };

const art = (path: string): Artifact => ({
  path,
  source: sourceUrl(`http://x/${path}`),
  rules: [],
});

/** A plugin that always returns the given contribution. */
const fixedPlugin = (
  contribution: Contribution,
  name = 'inner',
): LankaPlugin => ({
  name,
  build: () => contribution,
});

describe('defineArtifactPlugin', () => {
  it('keeps the inner plugin name', () => {
    const wrapped = defineArtifactPlugin(fixedPlugin({}, 'forge'), []);
    expect(wrapped.name).toBe('forge');
  });

  it('passes artifacts through unchanged with no overrides', async () => {
    const arts = [art('mods/a.jar'), art('mods/b.jar')];
    const wrapped = defineArtifactPlugin(fixedPlugin({ artifacts: arts }), []);
    const out = await wrapped.build(ctx);
    expect(out.artifacts).toEqual(arts);
  });

  it('excludes matched artifacts via overrides', async () => {
    const arts = [art('mods/realms.jar'), art('mods/jei.jar')];
    const wrapped = defineArtifactPlugin(fixedPlugin({ artifacts: arts }), [
      { match: '**/realms*.jar', exclude: true },
    ]);
    const out = await wrapped.build(ctx);
    expect(out.artifacts?.map((a) => a.path)).toEqual(['mods/jei.jar']);
  });

  it('attaches rules to matched artifacts', async () => {
    const wrapped = defineArtifactPlugin(
      fixedPlugin({ artifacts: [art('mods/optifine.jar')] }),
      [{ match: '**/optifine*.jar', rules: 'allow.os.osx' }],
    );
    const out = await wrapped.build(ctx);
    expect(out.artifacts?.[0]?.rules).toEqual([
      { action: 'allow', os: { name: 'osx' } },
    ]);
  });

  it('passes vars and launch through untouched', async () => {
    const wrapped = defineArtifactPlugin(
      fixedPlugin({
        artifacts: [art('mods/a.jar')],
        vars: { root: '.' },
        launch: { mainClass: 'Main' },
      }),
      [{ match: '**/a.jar', exclude: true }],
    );
    const out = await wrapped.build(ctx);
    expect(out.vars).toEqual({ root: '.' });
    expect(out.launch).toEqual({ mainClass: 'Main' });
    expect(out.artifacts).toEqual([]);
  });

  it('returns the contribution unchanged when it has no artifacts', async () => {
    const contribution: Contribution = { vars: { root: '.' } };
    const wrapped = defineArtifactPlugin(fixedPlugin(contribution), [
      { match: '**/*', exclude: true },
    ]);
    const out = await wrapped.build(ctx);
    expect(out).toEqual(contribution);
    expect('artifacts' in out).toBe(false);
  });

  it('applies overrides to an empty artifact list', async () => {
    const wrapped = defineArtifactPlugin(fixedPlugin({ artifacts: [] }), [
      { match: '**/*', exclude: true },
    ]);
    const out = await wrapped.build(ctx);
    expect(out.artifacts).toEqual([]);
  });

  it('awaits an async inner build hook', async () => {
    const inner: LankaPlugin = {
      name: 'async-inner',
      build: async () => ({
        artifacts: [art('mods/x.jar'), art('mods/y.jar')],
      }),
    };
    const wrapped = defineArtifactPlugin(inner, [
      { match: '**/x.jar', exclude: true },
    ]);
    const out = await wrapped.build(ctx);
    expect(out.artifacts?.map((a) => a.path)).toEqual(['mods/y.jar']);
  });

  it('forwards the build context to the inner plugin', async () => {
    let seen: BuildContext | undefined;
    const inner: LankaPlugin = {
      name: 'ctx-inner',
      build: (received) => {
        seen = received;
        return { artifacts: [] };
      },
    };
    const wrapped = defineArtifactPlugin(inner, []);
    await wrapped.build(ctx);
    expect(seen).toBe(ctx);
  });

  it('applies multiple overrides in list order', async () => {
    const wrapped = defineArtifactPlugin(
      fixedPlugin({ artifacts: [art('mods/x.jar')] }),
      [
        { match: '**/x.jar', rules: 'allow.os.linux' },
        { match: '**/x.jar', rules: 'allow.os.osx' },
      ],
    );
    const out = await wrapped.build(ctx);
    expect(out.artifacts?.[0]?.rules).toHaveLength(2);
  });
});
