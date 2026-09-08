import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { valValues } from '@opys/core';
import { resolveForge } from '../../lib/template';
import { lib, mojangServer, routedFetch, type MojangServer } from './fixtures';

// fuckforge, the recipe and install_profile still travel through
// `fetchWithRetry`, so they keep the `fetch` stub. The vanilla client does
// not — it is fetched inside the `opys-minecraft-vanilla` crate — so Mojang gets a
// real socket instead.
let mojang: MojangServer;

beforeEach(async () => {
  mojang = await mojangServer();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await mojang.close();
});

/** `resolveForge` with the source and the stand-in Mojang already wired. */
const forge = (version: string, extra: Record<string, unknown> = {}) =>
  resolveForge({
    version,
    source: SOURCE,
    manifestBase: mojang.manifestBase,
    ...extra,
  });

const SOURCE = 'https://fuckforge.test';

function master(forgeId: string, entryUrl: string) {
  const mc = forgeId.split('-')[0]!;
  return {
    versions: {
      [mc]: {
        latest: { forge: forgeId, url: entryUrl },
        recommended: { forge: forgeId, url: entryUrl },
        best: { forge: forgeId, url: entryUrl },
        list: [{ forge: forgeId, url: entryUrl }],
      },
    },
  };
}

function indexEntry(forgeId: string, extra: Record<string, unknown> = {}) {
  const mc = forgeId.split('-')[0]!;
  return {
    id: mc,
    forge: forgeId,
    files: {},
    manifest: null,
    recipe: `${SOURCE}/recipe/${forgeId}.json`,
    ...extra,
  };
}

// ── legacy era ────────────────────────────────────────────────────────────

const LEGACY_FORGE = '1.12.2-14.23.5.2860';

function legacyRecipe() {
  return {
    type: 'legacy',
    forge: LEGACY_FORGE,
    id: '1.12.2',
    mainClass: 'net.minecraft.launchwrapper.Launch',
    minecraftArguments: '--username ${auth_player_name} --tweakClass fml',
    libraries: [
      {
        name: `net.minecraftforge:forge:${LEGACY_FORGE}`,
        downloads: {
          artifact: {
            path: `net/minecraftforge/forge/${LEGACY_FORGE}/forge-${LEGACY_FORGE}-universal.jar`,
            url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${LEGACY_FORGE}/forge-${LEGACY_FORGE}-universal.jar`,
            sha1: '2'.repeat(40),
            size: 4466108,
          },
        },
      },
      {
        name: 'org.ow2.asm:asm-debug-all:5.2',
        downloads: {
          artifact: {
            path: 'org/ow2/asm/asm-debug-all/5.2/asm-debug-all-5.2.jar',
            url: 'https://maven/asm.jar',
            sha1: '1'.repeat(40),
            size: 100,
          },
        },
      },
    ],
  };
}

describe('resolveForge — legacy era', () => {
  it('builds a legacy template with vanilla + forge artifacts', async () => {
    routedFetch([
      ['versions.json', master(LEGACY_FORGE, `${SOURCE}/e.json`)],
      ['/e.json', indexEntry(LEGACY_FORGE)],
      [`/recipe/${LEGACY_FORGE}.json`, legacyRecipe()],
    ]);
    const t = await forge(LEGACY_FORGE);
    expect(valValues(t.mainClass)[0]).toBe(
      'net.minecraft.launchwrapper.Launch',
    );
    // forge universal + asm jars appended after the vanilla artifacts
    expect(t.artifacts.some((a) => a.path.includes('asm-debug-all'))).toBe(
      true,
    );
    // the universal jar comes from the recipe, hash and all — the index
    // entry's `files.universal` is never consulted
    const universal = t.artifacts.find((a) =>
      a.path.includes(`forge-${LEGACY_FORGE}-universal`),
    )!;
    expect(universal.integrity).toEqual({ sha1: '2'.repeat(40) });
    expect(universal.size).toBe(4466108);
    expect(t.vars.classpath).toBeDefined();
  });
});

// ── processor era ─────────────────────────────────────────────────────────

const PROC_FORGE = '1.20.1-47.4.20';

function processorRecipe() {
  return {
    type: 'processor',
    forge: PROC_FORGE,
    id: '1.20.1',
    mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
    arguments: {
      game: ['--launchTarget', 'forgeclient'],
      jvm: [
        '-p',
        '${library_directory}/cpw/mods/bootstraplauncher/1.1.2/bootstraplauncher-1.1.2.jar',
        '-DignoreList=foo',
      ],
    },
    libraries: [
      lib(
        'net.minecraftforge:forge:1.20.1-47.4.20:universal',
        'net/minecraftforge/forge/1.20.1-47.4.20/forge-universal.jar',
        'https://maven/forge-universal.jar',
      ),
      lib(
        'cpw.mods:bootstraplauncher:1.1.2',
        'cpw/mods/bootstraplauncher/1.1.2/bootstraplauncher-1.1.2.jar',
        'https://maven/bootstraplauncher.jar',
      ),
    ],
  };
}

const installProfile = {
  libraries: [
    lib(
      'net.minecraftforge:fmlcore:1.20.1-47.4.20',
      'net/minecraftforge/fmlcore/1.20.1-47.4.20/fmlcore.jar',
      'https://maven/fmlcore.jar',
    ),
  ],
};

function processorRoutes(extra: Record<string, unknown> = {}) {
  return routedFetch([
    ['versions.json', master(PROC_FORGE, `${SOURCE}/e.json`)],
    [
      '/e.json',
      indexEntry(PROC_FORGE, {
        files: {
          installer: { url: 'https://maven/installer.jar', md5: 'inst-md5' },
        },
        installProfile: `${SOURCE}/install_profile.json`,
        ...extra,
      }),
    ],
    [`/recipe/${PROC_FORGE}.json`, processorRecipe()],
    ['/install_profile.json', installProfile],
  ]);
}

describe('resolveForge — processor era', () => {
  it('builds a processor template with the ForgeWrapper main class', async () => {
    processorRoutes();
    const t = await forge(PROC_FORGE);
    expect(valValues(t.mainClass)[0]).toBe(
      'io.github.zekerzhayard.forgewrapper.installer.Main',
    );
  });

  it('includes installer + ForgeWrapper artifacts', async () => {
    processorRoutes();
    const t = await forge(PROC_FORGE);
    expect(
      t.artifacts.some((a) =>
        a.path.includes('forge-' + PROC_FORGE + '-installer.jar'),
      ),
    ).toBe(true);
    expect(t.artifacts.some((a) => a.path.includes('ForgeWrapper'))).toBe(true);
  });

  it('includes forgewrapper -D jvm args', async () => {
    processorRoutes();
    const t = await forge(PROC_FORGE);
    const jvm = t.jvmArgs.flatMap(valValues);
    expect(jvm.some((a) => a.startsWith('-Dforgewrapper.installer='))).toBe(
      true,
    );
    expect(jvm.some((a) => a.startsWith('-Dforgewrapper.librariesDir='))).toBe(
      true,
    );
  });

  it('strips module-path JVM args', async () => {
    processorRoutes();
    const t = await forge(PROC_FORGE);
    const jvm = t.jvmArgs.flatMap(valValues);
    expect(jvm.some((a) => a === '-p')).toBe(false);
    expect(jvm.some((a) => a.startsWith('-DignoreList='))).toBe(false);
  });

  it('uses the bundled ForgeWrapper sha1 by default (PrismLauncher fork)', async () => {
    processorRoutes();
    const t = await forge(PROC_FORGE);
    const fw = t.artifacts.find((a) => a.path.includes('ForgeWrapper'))!;
    expect(fw.integrity).toEqual({
      sha1: '4c4653d80409e7e968d3e3209196ffae778b7b4e',
    });
    expect(fw.size).toBeUndefined();
  });

  it('honours a custom ForgeWrapper url without bundled integrity', async () => {
    processorRoutes();
    const t = await forge(PROC_FORGE, {
      forgeWrapper: {
        url: 'https://example/fw.jar',
        path: '${library_directory}/fw.jar',
      },
    });
    const fw = t.artifacts.find(
      (a) => a.path === '${library_directory}/fw.jar',
    )!;
    expect(fw.source).toEqual({ url: 'https://example/fw.jar' });
    expect(fw.integrity).toBeUndefined();
    expect(fw.size).toBeUndefined();
  });

  it('honours an explicit ForgeWrapper sha1 and size', async () => {
    processorRoutes();
    const t = await forge(PROC_FORGE, {
      forgeWrapper: { url: 'https://x/fw.jar', sha1: 'aa', size: 5 },
    });
    const fw = t.artifacts.find((a) => a.path.includes('ForgeWrapper'))!;
    expect(fw.integrity).toEqual({ sha1: 'aa' });
    expect(fw.size).toBe(5);
  });

  it('throws when no installer file is listed', async () => {
    routedFetch([
      ['versions.json', master(PROC_FORGE, `${SOURCE}/e.json`)],
      [
        '/e.json',
        indexEntry(PROC_FORGE, {
          files: {},
          installProfile: `${SOURCE}/install_profile.json`,
        }),
      ],
      [`/recipe/${PROC_FORGE}.json`, processorRecipe()],
    ]);
    await expect(forge(PROC_FORGE)).rejects.toThrow(/No installer file listed/);
  });

  it('throws when no install_profile URL is listed', async () => {
    routedFetch([
      ['versions.json', master(PROC_FORGE, `${SOURCE}/e.json`)],
      [
        '/e.json',
        indexEntry(PROC_FORGE, {
          files: {
            installer: { url: 'https://x/i.jar', md5: 'm' },
          },
        }),
      ],
      [`/recipe/${PROC_FORGE}.json`, processorRecipe()],
    ]);
    await expect(forge(PROC_FORGE)).rejects.toThrow(
      /No install_profile URL listed/,
    );
  });

  it('throws when install_profile fetch is not ok', async () => {
    routedFetch([
      ['versions.json', master(PROC_FORGE, `${SOURCE}/e.json`)],
      [
        '/e.json',
        indexEntry(PROC_FORGE, {
          files: { installer: { url: 'https://x/i.jar', md5: 'm' } },
          installProfile: `${SOURCE}/install_profile.json`,
        }),
      ],
      [`/recipe/${PROC_FORGE}.json`, processorRecipe()],
      ['/install_profile.json', new Response('boom', { status: 404 })],
    ]);
    await expect(forge(PROC_FORGE)).rejects.toThrow(
      /Failed to fetch install_profile/,
    );
  });
});

// ── error paths ───────────────────────────────────────────────────────────

describe('resolveForge — errors', () => {
  it('throws when the index entry has no recipe URL', async () => {
    routedFetch([
      ['versions.json', master(PROC_FORGE, `${SOURCE}/e.json`)],
      ['/e.json', indexEntry(PROC_FORGE, { recipe: null })],
    ]);
    await expect(forge(PROC_FORGE)).rejects.toThrow(/No recipe URL listed/);
  });

  it('throws when the recipe fetch is not ok', async () => {
    routedFetch([
      ['versions.json', master(PROC_FORGE, `${SOURCE}/e.json`)],
      ['/e.json', indexEntry(PROC_FORGE)],
      [`/recipe/${PROC_FORGE}.json`, new Response('nope', { status: 404 })],
    ]);
    await expect(forge(PROC_FORGE)).rejects.toThrow(
      /Failed to fetch Forge recipe/,
    );
  });

  it('throws for an unsupported (jarmod) era recipe', async () => {
    routedFetch([
      ['versions.json', master('1.5.2-7.8.1', `${SOURCE}/e.json`)],
      ['/e.json', indexEntry('1.5.2-7.8.1')],
      [
        '/recipe/1.5.2-7.8.1.json',
        { type: 'jarmod', forge: '1.5.2-7.8.1', id: '1.5.2' },
      ],
    ]);
    await expect(forge('1.5.2-7.8.1')).rejects.toThrow(/is not yet supported/);
  });
});
