import { describe, expect, it } from 'vitest';
import { definePlugin } from '../../lib/plugin';
import type { BuildContext, LankaPlugin } from '../../lib/plugin';

describe('definePlugin', () => {
  it('returns the plugin object unchanged', () => {
    const plugin: LankaPlugin = { name: 'p', build: () => ({}) };
    expect(definePlugin(plugin)).toBe(plugin);
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
