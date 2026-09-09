/**
 * Live integration tests — hit the real Mojang, Forge, CurseForge, Modrinth
 * and Fabric APIs. Run with `npm run test:int`; excluded from the default
 * `npm test`.
 *
 * The CurseForge block is skipped unless `CURSEFORGE_TOKEN` is set.
 */
import { describe, expect, it } from 'vitest';
import type { BuildContext } from '@opys/dev';
import {
  forge,
  minecraft,
  curseforge,
  curseforgeModpack,
  modrinth,
  modrinthModpack,
} from '../../lib';

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
  // One version per install shape, not per Minecraft release. All four take
  // the same path now — the published document has already resolved the
  // differences — but they are the shapes that path has to survive: a bare
  // universal zip overlaid onto the client jar (1.4.7), a `stripMeta` jar mod
  // (1.5.2), a LaunchWrapper tweaker (1.7.10, 1.12.2), and a processor
  // install (1.16.5, 1.20.1).
  for (const version of [
    '1.4.7-best',
    '1.5.2-best',
    '1.7.10-best',
    '1.12.2-best',
    '1.16.5-best',
    '1.20.1-best',
  ]) {
    it(`resolves ${version} into a manifest contribution`, async () => {
      const c = await forge(version).build(ctx);
      expect(c.artifacts!.length).toBeGreaterThan(0);
      expect(c.launch).toHaveProperty('mainClass');
      expect(c.launch).toHaveProperty('jvmArgs');
      expect(c.launch).toHaveProperty('gameArgs');
      for (const a of c.artifacts!) {
        expect(a.path).toBeTruthy();
        // Every artifact must name something fetchable. An empty URL means a
        // jar the installer generates leaked into the download set.
        expect(a.source).toBeDefined();
        if ('url' in a.source) expect(a.source.url).toBeTruthy();
      }
    });
  }
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
      expect(a.source).toHaveProperty('url');
      expect(a.size).toBeGreaterThan(0);
    });
  },
);

describe.skipIf(!token)(
  'curseforge modpack plugin (live, needs CURSEFORGE_TOKEN)',
  () => {
    it('resolves a fabric modpack into vanilla + loader + mods + overrides', async () => {
      // Fabulously Optimized 5.4.1 — a stable file: MC 1.20.1, fabric.
      const c = await curseforgeModpack({
        token: token!,
        file: 4800279,
      }).build(ctx);

      expect(c.launch).toHaveProperty('command');
      expect(c.launch).toHaveProperty('jvmArgs');
      expect(c.launch).toHaveProperty('mainClass');
      expect(c.launch).toHaveProperty('gameArgs');
      expect(c.artifacts!.length).toBeGreaterThan(100);

      const mods = c.artifacts!.filter((a) =>
        a.path.startsWith('${game_directory}/mods/'),
      );
      expect(mods.length).toBeGreaterThan(10);

      const archives = c.artifacts!.filter((a) => a.path.endsWith('.zip'));
      const overrides = archives.find((a) => a.extract?.length);
      expect(overrides).toBeDefined();
      expect(overrides!.extract!.some((r) => 'matches' in r)).toBe(true);
    });
  },
);

describe('modrinth plugin (live)', () => {
  it('resolves a version id and a version URL into url artifacts', async () => {
    const c = await modrinth({
      path: (info) => `mods/${info.filename}`,
      versions: [
        // fabric-api 0.83.0+1.20.1 — a stable, long-published release.
        'rSrmGeeJ',
        // lithium mc1.20.1-0.11.2, referenced by its Modrinth version URL.
        'https://modrinth.com/mod/lithium/version/ZSNsJrPI',
      ],
    }).build(ctx);

    expect(c.artifacts!).toHaveLength(2);
    for (const a of c.artifacts!) {
      expect(a.path).toMatch(/^mods\/.+\.jar$/);
      expect(a.source).toHaveProperty('url');
      expect(a.size).toBeGreaterThan(0);
      expect(a.integrity).toMatchObject({ sha1: expect.any(String) });
    }
  });
});

describe('modrinth modpack plugin (live)', () => {
  it('resolves a fabric modpack into vanilla + loader + mods + overrides', async () => {
    // Fabulously Optimized 5.1.0 — a stable release: MC 1.20.1, fabric 0.14.21.
    const c = await modrinthModpack('fDlgR3Ps').build(ctx);

    // Loader-agnostic launch interface, re-exposed under the one plugin.
    expect(c.launch).toHaveProperty('command');
    expect(c.launch).toHaveProperty('jvmArgs');
    expect(c.launch).toHaveProperty('mainClass');
    expect(c.launch).toHaveProperty('gameArgs');

    // Vanilla client + libraries + assets (>100) bundled by the loader, plus
    // the pack's own mod files.
    expect(c.artifacts!.length).toBeGreaterThan(100);

    // The pack's mods land under ${game_directory}/mods.
    const mods = c.artifacts!.filter((a) =>
      a.path.startsWith('${game_directory}/mods/'),
    );
    expect(mods.length).toBeGreaterThan(10);

    // Exactly one .mrpack archive — the overrides extractor. (Vanilla natives
    // are also extract-bearing artifacts, so filter by the archive itself.)
    const archives = c.artifacts!.filter((a) => a.path.endsWith('.mrpack'));
    expect(archives).toHaveLength(1);
    expect(archives[0]!.extract!.some((r) => 'matches' in r)).toBe(true);

    // The pack's own mod files are plain downloads, never extracted.
    expect(mods.every((a) => !a.extract)).toBe(true);
  });
});
