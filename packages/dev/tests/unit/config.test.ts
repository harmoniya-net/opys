import { describe, expect, it } from 'vitest';
import { defineConfig, resolveConfig } from '../../lib/config';
import type { OpysConfig } from '../../lib/config';

const base: OpysConfig = {
  plugins: [],
  manifest: { command: () => 'java', args: () => [] },
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
