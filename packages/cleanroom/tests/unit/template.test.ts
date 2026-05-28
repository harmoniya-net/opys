import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { resolveCleanroom } from '../../lib/template';
import {
  ASSET_MANIFEST,
  VERSION_MANIFEST,
  clientJson,
  lib,
  routedFetch,
} from './fixtures';

afterEach(() => vi.unstubAllGlobals());

function ghReleases(tag = '0.5.9-alpha') {
  return [
    {
      tag_name: tag,
      prerelease: true,
      draft: false,
      published_at: '2024-01-01T00:00:00Z',
      assets: [
        {
          name: `cleanroom-${tag}-installer.jar`,
          size: 9999,
          browser_download_url: `https://gh/dl/cleanroom-${tag}-installer.jar`,
          digest: 'sha256:abc',
        },
      ],
    },
  ];
}

function installerZip(versionJson: unknown, installProfile: unknown) {
  return zipSync({
    'version.json': strToU8(JSON.stringify(versionJson)),
    'install_profile.json': strToU8(JSON.stringify(installProfile)),
  });
}

const versionJson = {
  id: 'cleanroom',
  inheritsFrom: '1.12.2',
  mainClass: 'top.outlands.foundation.boot.Foundation',
  minecraftArguments: '--username ${auth_player_name} --tweakClass cleanroom',
  libraries: [
    // a downloadable runtime lib
    lib(
      'com.cleanroommc:foo:1.0',
      'com/cleanroommc/foo/1.0/foo-1.0.jar',
      'https://maven/foo.jar',
    ),
    // bundled cleanroom jar with empty url — skipped from the download set
    {
      name: 'com.cleanroommc:cleanroom:0.5.9',
      downloads: {
        artifact: {
          path: 'com/cleanroommc/cleanroom/0.5.9/cleanroom-0.5.9.jar',
          url: '',
          sha1: '0'.repeat(40),
          size: 1,
        },
      },
    },
  ],
};

const installProfileJson = {
  spec: 0,
  profile: 'Cleanroom',
  version: 'cleanroom',
  minecraft: '1.12.2',
  libraries: [
    lib(
      'org.ow2.asm:asm:9.0',
      'org/ow2/asm/asm/9.0/asm-9.0.jar',
      'https://maven/asm9.jar',
    ),
  ],
};

/** A vanilla 1.12.2 client whose libraries include an lwjgl 2 family entry. */
function vanilla1122() {
  return clientJson('1.12.2', {
    libraries: [
      lib(
        'org.lwjgl.lwjgl:lwjgl:2.9.4',
        'org/lwjgl/lwjgl/lwjgl/2.9.4/lwjgl-2.9.4.jar',
      ),
      lib(
        'com.mojang:authlib:1.5.25',
        'com/mojang/authlib/1.5.25/authlib-1.5.25.jar',
      ),
    ],
  });
}

function routes(zip: Uint8Array) {
  return routedFetch([
    ['/releases', ghReleases()],
    ['cleanroom-0.5.9-alpha-installer.jar', new Response(zip)],
    ['version_manifest', VERSION_MANIFEST],
    ['/1.12.2.json', vanilla1122()],
    ['/assets/5.json', ASSET_MANIFEST],
  ]);
}

describe('resolveCleanroom', () => {
  it('builds a template with the Foundation main class', async () => {
    routes(installerZip(versionJson, installProfileJson));
    const t = await resolveCleanroom({ version: '0.5.9-alpha' });
    expect(t.mainClass.value[0]).toBe(
      'top.outlands.foundation.boot.Foundation',
    );
  });

  it('emits the installer artifact with a maven/ scan extract rule', async () => {
    routes(installerZip(versionJson, installProfileJson));
    const t = await resolveCleanroom({ version: '0.5.9-alpha' });
    const installer = t.artifacts.find((a) =>
      a.path.includes('cleanroom-0.5.9-alpha-installer.jar'),
    )!;
    expect(installer.integrity).toEqual({ sha256: 'abc' });
    expect(installer.extract).toEqual([
      {
        kind: 'scan',
        matches: 'maven/',
        into: '${library_directory}',
        strip: ['maven/'],
      },
    ]);
  });

  it('skips runtime libraries with an empty url from the download set', async () => {
    routes(installerZip(versionJson, installProfileJson));
    const t = await resolveCleanroom({ version: '0.5.9-alpha' });
    expect(
      t.artifacts.some((a) => a.path.includes('cleanroom-0.5.9.jar')),
    ).toBe(false);
    expect(t.artifacts.some((a) => a.path.includes('foo-1.0.jar'))).toBe(true);
    expect(t.artifacts.some((a) => a.path.includes('asm-9.0.jar'))).toBe(true);
  });

  it('drops the lwjgl 2 family from vanilla artifacts', async () => {
    routes(installerZip(versionJson, installProfileJson));
    const t = await resolveCleanroom({ version: '0.5.9-alpha' });
    expect(t.artifacts.some((a) => a.path.includes('lwjgl/lwjgl/2.9.4'))).toBe(
      false,
    );
    // a non-shadowed vanilla lib survives
    expect(t.artifacts.some((a) => a.path.includes('authlib'))).toBe(true);
  });

  it('falls back to arguments object when minecraftArguments is absent', async () => {
    const vj = {
      ...versionJson,
      minecraftArguments: undefined,
      arguments: { game: ['--demo'], jvm: [] },
    };
    routes(installerZip(vj, installProfileJson));
    const t = await resolveCleanroom({ version: '0.5.9-alpha' });
    expect(t.gameArgs.flatMap((v) => v.value)).toContain('--demo');
  });

  it('handles a version.json with no args fields at all', async () => {
    const vj = {
      ...versionJson,
      minecraftArguments: undefined,
      arguments: undefined,
    };
    routes(installerZip(vj, installProfileJson));
    const t = await resolveCleanroom({ version: '0.5.9-alpha' });
    expect(t.gameArgs).toEqual([]);
  });

  it('throws when the installer download is not ok', async () => {
    routedFetch([
      ['/releases', ghReleases()],
      [
        'cleanroom-0.5.9-alpha-installer.jar',
        new Response('gone', { status: 404 }),
      ],
    ]);
    await expect(resolveCleanroom({ version: '0.5.9-alpha' })).rejects.toThrow(
      /Failed to download Cleanroom installer/,
    );
  });

  it('throws when the installer zip is missing version.json', async () => {
    const zip = zipSync({
      'install_profile.json': strToU8(JSON.stringify(installProfileJson)),
    });
    routedFetch([
      ['/releases', ghReleases()],
      ['cleanroom-0.5.9-alpha-installer.jar', new Response(zip)],
    ]);
    await expect(resolveCleanroom({ version: '0.5.9-alpha' })).rejects.toThrow(
      /missing entry 'version.json'/,
    );
  });
});
