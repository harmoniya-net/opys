import { describe, expect, it } from 'vitest';
import { definePlugin } from '../../lib/plugin';
import type { BuildContext, OpysPlugin } from '../../lib/plugin';

describe('definePlugin', () => {
  it('wraps the plugin, preserving name and exposing the fluent methods', () => {
    const plugin: OpysPlugin = { name: 'p', build: () => ({}) };
    const chained = definePlugin(plugin);
    expect(chained.name).toBe('p');
    for (const m of [
      'exclude',
      'addRule',
      'removeIntegrity',
      'updateFirst',
      'updateMany',
    ] as const) {
      expect(typeof chained[m]).toBe('function');
    }
  });

  it('preserves a plugin whose build hook is async', async () => {
    const ctx: BuildContext = { log: () => {}, configDir: '/tmp', mode: '' };
    const plugin = definePlugin({
      name: 'async-plugin',
      build: async () => ({ vars: { root: '.' } }),
    });
    expect(plugin.name).toBe('async-plugin');
    await expect(plugin.build(ctx)).resolves.toEqual({ vars: { root: '.' } });
  });
});
