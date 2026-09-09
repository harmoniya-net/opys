import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  minecraft,
  forge,
  neoforge,
  fabric,
  cleanroom,
  lwjgl3ify,
  authliberty,
  curseforge,
  modrinth,
} from '../../lib';
import type { BuildContext } from '@opys/dev';
import {
  clientJson,
  documentSite,
  lib,
  mojangServer,
  routedFetch,
  type MojangServer,
} from './fixtures';

// Each loader's own API keeps the `fetch` stub; the vanilla client is fetched
// natively and gets a real socket.
let mojang: MojangServer;

beforeEach(async () => {
  mojang = await mojangServer({ '1.7.10': clientJson('1.7.10') });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await mojang.close();
});

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
    routedFetch([]);
    const plugin = minecraft('1.20.1', { manifestBase: mojang.manifestBase });
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
    routedFetch([]);
    await minecraft(undefined, { manifestBase: mojang.manifestBase }).build(
      ctx,
    );
    expect(logs.some((l) => l.includes('vanilla latest'))).toBe(true);
  });
});

describe('forge plugin', () => {
  it('builds a forge contribution from the published document', async () => {
    reset();
    routedFetch([]);
    const MC = '1.20.1';
    const F = `${MC}-47.4.20`;
    const site = await documentSite({
      mc: MC,
      build: F,
      key: 'forge',
      document: {
        id: `${MC}-forge-47.4.20`,
        inheritsFrom: MC,
        mainClass: 'io.github.zekerzhayard.forgewrapper.installer.Main',
        arguments: {
          game: [],
          jvm: ['-Dforgewrapper.librariesDir=${library_directory}'],
        },
        libraries: [
          lib(
            'cpw.mods:bootstraplauncher:1.1.2',
            'cpw/mods/bootstraplauncher/1.1.2/bootstraplauncher-1.1.2.jar',
            'https://maven/bl.jar',
          ),
        ],
      },
    });

    const plugin = forge(F, {
      source: site.source,
      manifestBase: mojang.manifestBase,
    });
    expect(plugin.name).toBe('forge');
    const c = await plugin.build(ctx);
    expect(c.artifacts!.length).toBeGreaterThan(0);
    expect(c.launch).toHaveProperty('mainClass');
    expect(logs.some((l) => l.includes(`resolved ${F}`))).toBe(true);
    await site.close();
  });
});

describe('neoforge plugin', () => {
  it('builds a neoforge contribution from the published document', async () => {
    reset();
    routedFetch([]);
    const MC = '1.20.4';
    const NF = '20.4.80-beta';
    const site = await documentSite({
      mc: MC,
      build: NF,
      key: 'neoforge',
      document: {
        id: `neoforge-${NF}`,
        inheritsFrom: MC,
        mainClass: 'io.github.zekerzhayard.forgewrapper.installer.Main',
        arguments: {
          game: ['--fml.neoForgeVersion', NF],
          jvm: ['-DlibraryDirectory=${library_directory}'],
        },
        libraries: [
          lib(
            'cpw.mods:bootstraplauncher:2.1.3',
            'cpw/mods/bootstraplauncher/2.1.3/bootstraplauncher-2.1.3.jar',
            'https://maven/bootstraplauncher.jar',
          ),
        ],
      },
    });

    const plugin = neoforge(NF, {
      source: site.source,
      manifestBase: mojang.manifestBase,
    });
    expect(plugin.name).toBe('neoforge');
    const c = await plugin.build(ctx);
    expect(c.artifacts!.length).toBeGreaterThan(0);
    expect(c.launch).toHaveProperty('mainClass');
    expect(logs.some((l) => l.includes(`resolved ${NF}`))).toBe(true);
    await site.close();
  });
});

describe('fabric plugin', () => {
  it('builds a fabric contribution', async () => {
    reset();
    const LOADER = '0.16.10';
    const profile = {
      inheritsFrom: '1.20.1',
      mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
      arguments: {
        game: [],
        jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '],
      },
      libraries: [
        {
          name: `net.fabricmc:fabric-loader:${LOADER}`,
          url: 'https://maven.fabricmc.net/',
          sha1: 'a'.repeat(40),
          size: 1000,
        },
        { name: 'org.ow2.asm:asm:9.7.1', url: 'https://maven.fabricmc.net/' },
      ],
    };
    routedFetch([['/profile/json', profile]]);
    const plugin = fabric('1.20.1', {
      loader: LOADER,
      manifestBase: mojang.manifestBase,
    });
    expect(plugin.name).toBe('fabric');
    const c = await plugin.build(ctx);
    expect(c.artifacts!.length).toBeGreaterThan(0);
    expect(c.launch).toHaveProperty('mainClass');
    expect(logs.some((l) => l.includes('resolved 1.20.1'))).toBe(true);
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
    ]);
    const plugin = cleanroom('0.5.9-alpha', {
      manifestBase: mojang.manifestBase,
    });
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
      [
        'gh/version.json',
        clientJson('1.7.10', {
          id: '1.7.10-lwjgl3ify',
          assetIndex: {
            id: '5',
            sha1: 'e'.repeat(40),
            size: 400,
            totalSize: 5000,
            url: mojang.assetsUrl,
          },
        }),
      ],
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

describe('modrinth plugin', () => {
  it('builds a modrinth contribution from version refs', async () => {
    reset();
    routedFetch([
      [
        '/v2/versions',
        [
          {
            id: 'abc',
            project_id: 'proj',
            version_number: '1.0',
            files: [
              {
                filename: 'sodium.jar',
                url: 'https://cdn.modrinth.com/sodium.jar',
                primary: true,
                size: 10,
                hashes: { sha1: 'sha1', sha512: 'sha512' },
              },
            ],
          },
        ],
      ],
    ]);
    const plugin = modrinth({
      path: (i) => `mods/${i.filename}`,
      versions: ['abc'],
    });
    expect(plugin.name).toBe('modrinth');
    const c = await plugin.build(ctx);
    expect(c.artifacts).toHaveLength(1);
    expect(c.artifacts![0]!.path).toBe('mods/sodium.jar');
    expect(c.artifacts![0]!.integrity).toEqual({ sha1: 'sha1' });
    expect(logs.some((l) => l.includes('1 file(s)'))).toBe(true);
  });
});
