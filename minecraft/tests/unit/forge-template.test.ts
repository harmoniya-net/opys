import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveForge } from '../../lib/forge/template';
import {
  ASSET_MANIFEST,
  VERSION_MANIFEST,
  clientJson,
  lib,
  routedFetch,
} from './fixtures';

afterEach(() => vi.unstubAllGlobals());

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
            path: `net/minecraftforge/forge/${LEGACY_FORGE}/forge-${LEGACY_FORGE}.jar`,
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
      [
        '/e.json',
        indexEntry(LEGACY_FORGE, {
          files: {
            universal: {
              url: 'https://fuckforge/universal.jar',
              md5: 'abc',
            },
          },
        }),
      ],
      [`/recipe/${LEGACY_FORGE}.json`, legacyRecipe()],
      ['version_manifest', VERSION_MANIFEST],
      ['/1.12.2.json', clientJson('1.12.2')],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    const t = await resolveForge({ version: LEGACY_FORGE, source: SOURCE });
    expect(t.mainClass.value[0]).toBe('net.minecraft.launchwrapper.Launch');
    // forge universal + asm jars appended after the vanilla artifacts
    expect(t.artifacts.some((a) => a.path.includes('asm-debug-all'))).toBe(
      true,
    );
    expect(
      t.artifacts.some((a) => a.path.includes('forge-' + LEGACY_FORGE)),
    ).toBe(true);
    expect(t.vars.classpath).toBeDefined();
  });

  it('fails recipe parsing when the universal jar has no URL or fallback', async () => {
    // With no `files.universal` on the index entry, the recipe's universal
    // placeholder library (which carries no URL of its own) has no fallback
    // — recipe parsing throws before buildLegacyTemplate's own guard runs.
    routedFetch([
      ['versions.json', master(LEGACY_FORGE, `${SOURCE}/e.json`)],
      ['/e.json', indexEntry(LEGACY_FORGE)],
      [`/recipe/${LEGACY_FORGE}.json`, legacyRecipe()],
    ]);
    await expect(
      resolveForge({ version: LEGACY_FORGE, source: SOURCE }),
    ).rejects.toThrow(/has no URL and no fallback/);
  });

  it('throws "No universal JAR listed" for a legacy recipe with no universal lib', async () => {
    // A legacy recipe whose libraries[] omits the universal placeholder
    // entirely reaches buildLegacyTemplate's own files.universal guard.
    const recipeNoUniversal = {
      ...legacyRecipe(),
      libraries: legacyRecipe().libraries.slice(1),
    };
    routedFetch([
      ['versions.json', master(LEGACY_FORGE, `${SOURCE}/e.json`)],
      ['/e.json', indexEntry(LEGACY_FORGE)],
      [`/recipe/${LEGACY_FORGE}.json`, recipeNoUniversal],
    ]);
    await expect(
      resolveForge({ version: LEGACY_FORGE, source: SOURCE }),
    ).rejects.toThrow(/No universal JAR listed/);
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
    ['version_manifest', VERSION_MANIFEST],
    ['/1.20.1.json', clientJson('1.20.1')],
    ['/assets/5.json', ASSET_MANIFEST],
  ]);
}

describe('resolveForge — processor era', () => {
  it('builds a processor template with the ForgeWrapper main class', async () => {
    processorRoutes();
    const t = await resolveForge({ version: PROC_FORGE, source: SOURCE });
    expect(t.mainClass.value[0]).toBe(
      'io.github.zekerzhayard.forgewrapper.installer.Main',
    );
  });

  it('includes installer + ForgeWrapper artifacts', async () => {
    processorRoutes();
    const t = await resolveForge({ version: PROC_FORGE, source: SOURCE });
    expect(
      t.artifacts.some((a) =>
        a.path.includes('forge-' + PROC_FORGE + '-installer.jar'),
      ),
    ).toBe(true);
    expect(t.artifacts.some((a) => a.path.includes('forgewrapper'))).toBe(true);
  });

  it('appends forgewrapper -D jvm args', async () => {
    processorRoutes();
    const t = await resolveForge({ version: PROC_FORGE, source: SOURCE });
    const jvm = t.jvmArgs.flatMap((v) => v.value);
    expect(jvm.some((a) => a.startsWith('-Dforgewrapper.installer='))).toBe(
      true,
    );
    expect(jvm.some((a) => a.startsWith('-Dforgewrapper.librariesDir='))).toBe(
      true,
    );
  });

  it('uses the bundled ForgeWrapper sha1/size by default', async () => {
    processorRoutes();
    const t = await resolveForge({ version: PROC_FORGE, source: SOURCE });
    const fw = t.artifacts.find((a) => a.path.includes('forgewrapper'))!;
    expect(fw.integrity).toEqual({
      sha1: '035a51fe6439792a61507630d89382f621da0f1f',
    });
    expect(fw.size).toBe(28679);
  });

  it('honours a custom ForgeWrapper url without bundled integrity', async () => {
    processorRoutes();
    const t = await resolveForge({
      version: PROC_FORGE,
      source: SOURCE,
      forgeWrapper: {
        url: 'https://example/fw.jar',
        path: '${library_directory}/fw.jar',
      },
    });
    const fw = t.artifacts.find(
      (a) => a.path === '${library_directory}/fw.jar',
    )!;
    expect(fw.source).toEqual({ kind: 'url', url: 'https://example/fw.jar' });
    expect(fw.integrity).toBeUndefined();
    expect(fw.size).toBeUndefined();
  });

  it('honours an explicit ForgeWrapper sha1 and size', async () => {
    processorRoutes();
    const t = await resolveForge({
      version: PROC_FORGE,
      source: SOURCE,
      forgeWrapper: { url: 'https://x/fw.jar', sha1: 'aa', size: 5 },
    });
    const fw = t.artifacts.find((a) => a.path.includes('forgewrapper'))!;
    expect(fw.integrity).toEqual({ sha1: 'aa' });
    expect(fw.size).toBe(5);
  });

  it('rewrites ../libraries/ paths in conditional array-value jvm args', async () => {
    routedFetch([
      ['versions.json', master(PROC_FORGE, `${SOURCE}/e.json`)],
      [
        '/e.json',
        indexEntry(PROC_FORGE, {
          files: {
            installer: { url: 'https://maven/installer.jar', md5: 'm' },
          },
          installProfile: `${SOURCE}/install_profile.json`,
        }),
      ],
      [
        `/recipe/${PROC_FORGE}.json`,
        {
          ...processorRecipe(),
          arguments: {
            game: [],
            jvm: [
              // conditional arg with an array value carrying a ../libraries/ path
              {
                rules: [{ action: 'allow', os: { name: 'osx' } }],
                value: ['-p', '../libraries/cpw/mods/foo.jar'],
              },
            ],
          },
        },
      ],
      ['/install_profile.json', installProfile],
      ['version_manifest', VERSION_MANIFEST],
      ['/1.20.1.json', clientJson('1.20.1')],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    const t = await resolveForge({ version: PROC_FORGE, source: SOURCE });
    const jvm = t.jvmArgs.flatMap((v) => v.value);
    // the ../libraries/ prefix is rewritten to the torba var
    expect(
      jvm.some((a) => a.includes('${library_directory}/cpw/mods/foo.jar')),
    ).toBe(true);
    expect(jvm.some((a) => a.includes('../libraries/'))).toBe(false);
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
    await expect(
      resolveForge({ version: PROC_FORGE, source: SOURCE }),
    ).rejects.toThrow(/No installer file listed/);
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
    await expect(
      resolveForge({ version: PROC_FORGE, source: SOURCE }),
    ).rejects.toThrow(/No install_profile URL listed/);
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
    await expect(
      resolveForge({ version: PROC_FORGE, source: SOURCE }),
    ).rejects.toThrow(/Failed to fetch install_profile/);
  });
});

// ── error paths ───────────────────────────────────────────────────────────

describe('resolveForge — errors', () => {
  it('throws when the index entry has no recipe URL', async () => {
    routedFetch([
      ['versions.json', master(PROC_FORGE, `${SOURCE}/e.json`)],
      ['/e.json', indexEntry(PROC_FORGE, { recipe: null })],
    ]);
    await expect(
      resolveForge({ version: PROC_FORGE, source: SOURCE }),
    ).rejects.toThrow(/No recipe URL listed/);
  });

  it('throws when the recipe fetch is not ok', async () => {
    routedFetch([
      ['versions.json', master(PROC_FORGE, `${SOURCE}/e.json`)],
      ['/e.json', indexEntry(PROC_FORGE)],
      [`/recipe/${PROC_FORGE}.json`, new Response('nope', { status: 404 })],
    ]);
    await expect(
      resolveForge({ version: PROC_FORGE, source: SOURCE }),
    ).rejects.toThrow(/Failed to fetch Forge recipe/);
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
    await expect(
      resolveForge({ version: '1.5.2-7.8.1', source: SOURCE }),
    ).rejects.toThrow(/is not yet supported/);
  });
});
