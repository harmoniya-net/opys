import { describe, expect, it } from 'vitest';
import { defineConfig, resolveConfig } from '../../lib/config';
import type { OpysConfig } from '../../lib/config';

const base: OpysConfig = {
  plugins: [],
  manifest: { command: 'java', args: [] },
};

describe('defineConfig', () => {
  it('returns an object config unchanged', () => {
    expect(defineConfig(base)).toBe(base);
  });

  it('returns a function config unchanged', () => {
    const fn = () => base;
    expect(defineConfig(fn)).toBe(fn);
  });
});

describe('resolveConfig', () => {
  it('passes a plain object config straight through', async () => {
    expect(await resolveConfig(base, { mode: '' })).toBe(base);
  });

  it('invokes a function config with the context', async () => {
    const resolved = await resolveConfig(
      (ctx) => ({ ...base, output: ctx.mode }),
      { mode: 'launch' },
    );
    expect(resolved.output).toBe('launch');
  });

  it('awaits an async function config', async () => {
    const resolved = await resolveConfig(
      async () => ({ ...base, output: 'async.json' }),
      { mode: '' },
    );
    expect(resolved.output).toBe('async.json');
  });
});

describe('withLibraryFiles', () => {
  it('makes a local library path absolute, against the config, and leaves the rest', async () => {
    const { withLibraryFiles } = await import('../../lib/loader');
    const options = {
      version: '1.20.1',
      libraries: [
        {
          name: 'a:a:1',
          artifact: { path: 'a.jar', source: { file: 'libs/a.jar' } },
        },
        {
          name: 'b:b:1',
          artifact: { path: 'b.jar', source: { file: '/abs/b.jar' } },
        },
        {
          name: 'c:c:1',
          artifact: {
            path: 'c.jar',
            source: { url: 'https://x/c.jar' },
            size: 3,
          },
        },
      ],
    };
    const out = withLibraryFiles(options, '/srv/pack');
    expect(out.libraries.map((library) => library.artifact)).toEqual([
      { path: 'a.jar', source: { file: '/srv/pack/libs/a.jar' } },
      { path: 'b.jar', source: { file: '/abs/b.jar' } },
      { path: 'c.jar', source: { url: 'https://x/c.jar' }, size: 3 },
    ]);
    expect(out.version).toBe('1.20.1');
    // Nothing to do is nothing done.
    const bare: { version: string; libraries?: [] } = { version: '1.20.1' };
    expect(withLibraryFiles(bare, '/srv/pack')).toBe(bare);
  });
});
