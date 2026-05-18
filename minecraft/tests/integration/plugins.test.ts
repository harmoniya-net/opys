/**
 * Live integration tests — hit the real Mojang, Forge and CurseForge APIs.
 * Run with `npm run test:int`; excluded from the default `npm test`.
 *
 * The CurseForge block is skipped unless `CURSEFORGE_TOKEN` is set.
 */
import { describe, expect, it } from 'vitest';
import type { BuildContext } from '@torba/dev';
import { forge, minecraft, curseforge } from '../../lib';

const ctx: BuildContext = {
  log: () => {},
  configDir: process.cwd(),
  mode: '',
};

describe('minecraft vanilla plugin (live)', () => {
  it('resolves vanilla 1.20.1 into client + libraries + assets', async () => {
    const c = await minecraft('1.20.1').build(ctx);
    // Client jar + libraries + asset index + asset objects.
    expect(c.artifacts!.length).toBeGreaterThan(100);
    expect(c.launch).toHaveProperty('mainClass');
    expect(c.launch).toHaveProperty('command');
    for (const a of c.artifacts!) {
      expect(a.path).toBeTruthy();
      expect(a.source).toBeDefined();
    }
  });
});

describe('forge plugin (live)', () => {
  it('resolves a 1.20.1 Forge build into a manifest contribution', async () => {
    const c = await forge('1.20.1-best').build(ctx);
    expect(c.artifacts!.length).toBeGreaterThan(0);
    expect(c.launch).toHaveProperty('mainClass');
    expect(c.launch).toHaveProperty('jvmArgs');
    expect(c.launch).toHaveProperty('gameArgs');
    for (const a of c.artifacts!) {
      expect(a.path).toBeTruthy();
    }
  });
});

const token = process.env.CURSEFORGE_TOKEN;

describe.skipIf(!token)(
  'curseforge plugin (live, needs CURSEFORGE_TOKEN)',
  () => {
    it('resolves a known file id into a url artifact', async () => {
      const c = await curseforge({
        token: token!,
        path: (info) => `mods/${info.filename}`,
        // aiotbotania-1.20.1 — a stable, long-published CurseForge file id.
        files: [6717445],
      }).build(ctx);

      expect(c.artifacts!).toHaveLength(1);
      const a = c.artifacts![0]!;
      expect(a.path).toMatch(/^mods\/.+\.jar$/);
      expect(a.source).toMatchObject({ kind: 'url' });
      expect(a.size).toBeGreaterThan(0);
    });
  },
);
