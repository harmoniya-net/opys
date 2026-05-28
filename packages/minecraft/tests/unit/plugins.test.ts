import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  minecraft,
  forge,
  cleanroom,
  lwjgl3ify,
  authliberty,
  curseforge,
} from '../../lib';
import type { BuildContext } from '@opys/dev';
import {
  ASSET_MANIFEST,
  VERSION_MANIFEST,
  clientJson,
  lib,
  routedFetch,
  vanillaRoutes,
} from './fixtures';

afterEach(() => vi.unstubAllGlobals());

const logs: string[] = [];
const ctx: BuildContext = {
  log: (_scope, msg) => logs.push(msg),
  configDir: '/tmp',
  mode: '',
};

function reset() {
  logs.length = 0;
}

describe('minecraft plugin', () => {
  it('builds vanilla artifacts + launch groups', async () => {
    reset();
    routedFetch(vanillaRoutes());
    const plugin = minecraft('1.20.1');
    expect(plugin.name).toBe('minecraft');
    const c = await plugin.build(ctx);
    expect(c.artifacts!.length).toBeGreaterThan(0);
    expect(c.launch!.command).toBe('${java_bin}');
    expect(c.launch).toHaveProperty('jvmArgs');
    expect(c.launch).toHaveProperty('mainClass');
    expect(c.launch).toHaveProperty('gameArgs');
    expect(logs.some((l) => l.includes('vanilla 1.20.1'))).toBe(true);
  });

  it('logs "latest" when no version is supplied', async () => {
    reset();
    routedFetch(vanillaRoutes());
    await minecraft().build(ctx);
    expect(logs.some((l) => l.includes('vanilla latest'))).toBe(true);
  });
});

describe('forge plugin', () => {
  it('builds a processor-era forge contribution', async () => {
    reset();
    const F = '1.20.1-47.4.20';
    routedFetch([
      [
        'versions.json',
        {
          versions: {
            '1.20.1': {
              latest: { forge: F, url: 'https://ff/e.json' },
              recommended: { forge: F, url: 'https://ff/e.json' },
              best: { forge: F, url: 'https://ff/e.json' },
              list: [{ forge: F, url: 'https://ff/e.json' }],
            },
          },
        },
      ],
      [
        '/e.json',
        {
          id: '1.20.1',
          forge: F,
          files: {
            installer: { url: 'https://maven/i.jar', md5: 'm' },
          },
          installProfile: 'https://ff/install_profile.json',
          manifest: null,
          recipe: 'https://ff/recipe.json',
        },
      ],
      [
        '/recipe.json',
        {
          type: 'processor',
          forge: F,
          id: '1.20.1',
          mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
          arguments: { game: [], jvm: [] },
          libraries: [
            lib(
              'cpw.mods:bootstraplauncher:1.1.2',
              'cpw/mods/bootstraplauncher/1.1.2/bootstraplauncher-1.1.2.jar',
              'https://maven/bl.jar',
            ),
          ],
        },
      ],
      ['/install_profile.json', { libraries: [] }],
      ['version_manifest', VERSION_MANIFEST],
      ['/1.20.1.json', clientJson('1.20.1')],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    const plugin = forge(F);
    expect(plugin.name).toBe('forge');
    const c = await plugin.build(ctx);
    expect(c.artifacts!.length).toBeGreaterThan(0);
    expect(c.launch).toHaveProperty('mainClass');
    expect(logs.some((l) => l.includes(`resolved ${F}`))).toBe(true);
  });
});

describe('cleanroom plugin', () => {
  it('builds a cleanroom contribution', async () => {
    reset();
    const versionJson = {
      id: 'cleanroom',
      inheritsFrom: '1.12.2',
      mainClass: 'top.outlands.foundation.boot.Foundation',
      minecraftArguments: '--username ${auth_player_name}',
      libraries: [],
    };
    const installProfile = {
      spec: 0,
      profile: 'Cleanroom',
      version: 'cleanroom',
      minecraft: '1.12.2',
      libraries: [],
    };
    const zip = zipSync({
      'version.json': strToU8(JSON.stringify(versionJson)),
      'install_profile.json': strToU8(JSON.stringify(installProfile)),
    });
    routedFetch([
      [
        '/releases',
        [
          {
            tag_name: '0.5.9-alpha',
            prerelease: true,
            draft: false,
            published_at: '2024-01-01T00:00:00Z',
            assets: [
              {
                name: 'cleanroom-0.5.9-alpha-installer.jar',
                size: 1,
                browser_download_url:
                  'https://gh/cleanroom-0.5.9-alpha-installer.jar',
              },
            ],
          },
        ],
      ],
      ['cleanroom-0.5.9-alpha-installer.jar', new Response(zip)],
      ['version_manifest', VERSION_MANIFEST],
      ['/1.12.2.json', clientJson('1.12.2')],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    const plugin = cleanroom('0.5.9-alpha');
    expect(plugin.name).toBe('cleanroom');
    const c = await plugin.build(ctx);
    expect(c.artifacts!.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes('resolved 0.5.9-alpha'))).toBe(true);
  });
});

describe('lwjgl3ify plugin', () => {
  it('builds an lwjgl3ify contribution', async () => {
    reset();
    routedFetch([
      [
        '/repos/GTNewHorizons/lwjgl3ify/releases',
        [
          {
            tag_name: '3.0.16',
            prerelease: false,
            draft: false,
            published_at: '2024-06-01T00:00:00Z',
            assets: [
              {
                name: 'version.json',
                size: 1,
                browser_download_url: 'https://gh/version.json',
              },
              {
                name: 'lwjgl3ify-3.0.16.jar',
                size: 1,
                browser_download_url: 'https://gh/lwjgl3ify-3.0.16.jar',
              },
            ],
          },
        ],
      ],
      ['gh/version.json', clientJson('1.7.10', { id: '1.7.10-lwjgl3ify' })],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    const plugin = lwjgl3ify('3.0.16', { unimixins: false });
    expect(plugin.name).toBe('lwjgl3ify');
    const c = await plugin.build(ctx);
    expect(c.artifacts!.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes('resolved 3.0.16'))).toBe(true);
  });
});

describe('authliberty plugin', () => {
  it('builds an authliberty contribution exposing only jvmArgs', async () => {
    reset();
    routedFetch([
      [
        '/package_files',
        [
          {
            id: 1,
            package_id: 100,
            file_name: 'authliberty-0.3.jar',
            size: 1,
            file_sha256: 'h',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      ],
      [
        '/packages',
        [
          {
            id: 100,
            name: 'authliberty',
            version: '0.3',
            package_type: 'generic',
            status: 'default',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      ],
    ]);
    const plugin = authliberty('0.3');
    expect(plugin.name).toBe('authliberty');
    const c = await plugin.build(ctx);
    expect(c.artifacts).toHaveLength(1);
    expect(c.launch).toEqual({ jvmArgs: expect.anything() });
    expect(logs.some((l) => l.includes('resolved 0.3'))).toBe(true);
  });
});

describe('curseforge plugin', () => {
  it('builds a curseforge contribution from file refs', async () => {
    reset();
    routedFetch([
      [
        '/mods/files',
        {
          data: [
            {
              id: 555,
              modId: 1,
              fileName: 'jei.jar',
              fileLength: 10,
              hashes: [{ value: 'sha1', algo: 1 }],
              downloadUrl: 'https://cdn/jei.jar',
            },
          ],
        },
      ],
    ]);
    const plugin = curseforge({
      token: 't',
      path: (i) => `mods/${i.filename}`,
      files: [555],
    });
    expect(plugin.name).toBe('curseforge');
    const c = await plugin.build(ctx);
    expect(c.artifacts).toHaveLength(1);
    expect(c.artifacts![0]!.path).toBe('mods/jei.jar');
    expect(logs.some((l) => l.includes('1 file(s)'))).toBe(true);
  });
});
