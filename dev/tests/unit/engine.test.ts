import { describe, expect, it } from 'vitest';
import { sourceUrl } from '@torba/core';
import { buildManifest } from '../../lib/engine';
import type { TorbaConfig } from '../../lib/config';
import type { BuildContext, Contribution, TorbaPlugin } from '../../lib/plugin';

const ctx: BuildContext = { log: () => {}, configDir: '/tmp', mode: '' };

const fakePlugin = (name: string, contribution: Contribution): TorbaPlugin => ({
  name,
  build: () => contribution,
});

describe('buildManifest', () => {
  it('merges artifacts and vars, assembles launch from accessors', async () => {
    const config: TorbaConfig = {
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
        args: ({ base }) => [base!.jvmArgs, base!.mainClass],
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
    const config: TorbaConfig = {
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
    const config: TorbaConfig = {
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
});
