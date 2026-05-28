import { describe, expect, it } from 'vitest';
import { sourceUrl, type Artifact } from '@opys/core';
import { buildManifest } from '../../lib/engine';
import type { OpysConfig } from '../../lib/config';
import type { BuildContext, Contribution, OpysPlugin } from '../../lib/plugin';

const ctx: BuildContext = { log: () => {}, configDir: '/tmp', mode: '' };

const fakePlugin = (name: string, contribution: Contribution): OpysPlugin => ({
  name,
  build: () => contribution,
});

describe('buildManifest', () => {
  it('merges artifacts and vars, assembles launch from accessors', async () => {
    const config: OpysConfig = {
      plugins: [
        fakePlugin('base', {
          artifacts: [
            { path: 'a.jar', source: sourceUrl('http://x/a'), rules: [] },
          ],
          vars: { root: '.' },
          launch: {
            jvmArgs: [{ rules: [], value: ['-Xmx2G'] }],
            mainClass: 'Main',
          },
        }),
        fakePlugin('extra', {
          artifacts: [
            { path: 'b.jar', source: sourceUrl('http://x/b'), rules: [] },
          ],
          launch: { bin: 'java' },
        }),
      ],
      manifest: {
        command: ({ extra }) => extra!.bin as string,
        args: ({ base }) => [base!.jvmArgs!, base!.mainClass!],
        workdir: '${root}',
      },
    };
    const m = await buildManifest(config, ctx);
    expect(m.artifacts).toHaveLength(2);
    expect(m.vars).toEqual({ root: '.' });
    expect(m.launch?.command).toBe('java');
    expect(m.launch?.workdir).toBe('${root}');
    expect(m.launch?.args).toEqual([
      { rules: [], value: ['-Xmx2G'] },
      { rules: [], value: ['Main'] },
    ]);
  });

  it('config vars override plugin vars; literal artifacts merge', async () => {
    const config: OpysConfig = {
      plugins: [fakePlugin('p', { vars: { root: 'plugin' } })],
      manifest: {
        command: () => 'java',
        args: () => [],
        vars: { root: 'override' },
        artifacts: [
          { path: 'lit.jar', source: sourceUrl('http://x/l'), rules: [] },
        ],
      },
    };
    const m = await buildManifest(config, ctx);
    expect(m.vars).toEqual({ root: 'override' });
    expect(m.artifacts).toHaveLength(1);
    expect(m.artifacts[0]!.path).toBe('lit.jar');
  });

  it('warns on a plugin-vs-plugin var collision', async () => {
    const logs: string[] = [];
    const config: OpysConfig = {
      plugins: [
        fakePlugin('a', { vars: { x: '1' } }),
        fakePlugin('b', { vars: { x: '2' } }),
      ],
      manifest: { command: () => 'java', args: () => [] },
    };
    await buildManifest(config, {
      log: (_scope, msg) => logs.push(msg),
      configDir: '/tmp',
      mode: '',
    });
    expect(logs.some((l) => l.includes("var 'x'"))).toBe(true);
  });

  it('does not warn when a plugin re-sets its own var', async () => {
    const logs: string[] = [];
    const config: OpysConfig = {
      plugins: [fakePlugin('a', { vars: { x: '1' } })],
      manifest: { command: () => 'java', args: () => [] },
    };
    await buildManifest(config, {
      log: (_s, msg) => logs.push(msg),
      configDir: '/tmp',
      mode: '',
    });
    expect(logs.some((l) => l.includes("var 'x'"))).toBe(false);
  });

  it('flattens a bare Val arg item and dedupes artifacts', async () => {
    const dup: Artifact = {
      path: 'same.jar',
      source: sourceUrl('http://x/1'),
      rules: [],
    };
    const config: OpysConfig = {
      plugins: [
        fakePlugin('p', {
          artifacts: [dup, { ...dup, source: sourceUrl('http://x/2') }],
          launch: { single: { rules: [], value: ['-flag'] } },
        }),
      ],
      manifest: {
        command: () => 'java',
        args: ({ p }) => [p!.single!, 'tail'],
      },
    };
    const m = await buildManifest(config, ctx);
    expect(m.artifacts).toHaveLength(1);
    expect(m.artifacts[0]!.source).toEqual(sourceUrl('http://x/2'));
    expect(m.launch?.args).toEqual([
      { rules: [], value: ['-flag'] },
      { rules: [], value: ['tail'] },
    ]);
  });

  it('resolves workdir and envs from accessor functions', async () => {
    const config: OpysConfig = {
      plugins: [fakePlugin('p', { launch: { dir: '/srv' } })],
      manifest: {
        command: () => 'java',
        args: () => [],
        workdir: ({ p }) => p!.dir as string,
        envs: ({ p }) => ({ HOME: p!.dir as string }),
      },
    };
    const m = await buildManifest(config, ctx);
    expect(m.launch?.workdir).toBe('/srv');
    expect(m.launch?.envs).toEqual({ HOME: '/srv' });
  });

  it('defaults workdir to "." and envs to {} when omitted', async () => {
    const config: OpysConfig = {
      plugins: [],
      manifest: { command: () => 'java', args: () => [] },
    };
    const m = await buildManifest(config, ctx);
    expect(m.launch?.workdir).toBe('.');
    expect(m.launch?.envs).toEqual({});
  });

  it('accepts a literal envs object and emits restrict', async () => {
    const config: OpysConfig = {
      plugins: [],
      manifest: {
        command: () => 'java',
        args: () => [],
        envs: { KEY: 'val' },
        restrict: ['mods/**'],
      },
    };
    const m = await buildManifest(config, ctx);
    expect(m.launch?.envs).toEqual({ KEY: 'val' });
    expect(m.restrict).toEqual(['mods/**']);
  });

  it('omits restrict when the config provides an empty list', async () => {
    const config: OpysConfig = {
      plugins: [],
      manifest: { command: () => 'java', args: () => [], restrict: [] },
    };
    expect((await buildManifest(config, ctx)).restrict).toBeUndefined();
  });
});
