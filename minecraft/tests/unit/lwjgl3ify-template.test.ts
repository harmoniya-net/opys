import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLwjgl3ify } from '../../lib/lwjgl3ify/template';
import { ASSET_MANIFEST, clientJson, lib, routedFetch } from './fixtures';

afterEach(() => vi.unstubAllGlobals());

function lwjgl3ifyReleases(tag = '3.0.16') {
  return [
    {
      tag_name: tag,
      prerelease: false,
      draft: false,
      published_at: '2024-06-01T00:00:00Z',
      assets: [
        {
          name: 'version.json',
          size: 10,
          browser_download_url: 'https://gh/dl/version.json',
        },
        {
          name: `lwjgl3ify-${tag}.jar`,
          size: 5000,
          browser_download_url: `https://gh/dl/lwjgl3ify-${tag}.jar`,
          digest: 'sha256:modhash',
        },
      ],
    },
  ];
}

function unimixinsReleases(tag = '1.0.0') {
  return [
    {
      tag_name: tag,
      prerelease: false,
      draft: false,
      assets: [
        {
          name: `+unimixins-all-1.7.10-${tag}.jar`,
          size: 7000,
          browser_download_url: `https://gh/dl/unimixins-${tag}.jar`,
          digest: 'sha256:umhash',
        },
      ],
    },
  ];
}

/**
 * lwjgl3ify ships a self-contained Mojang-format client manifest. We add a
 * "repo-style" library (name + top-level url, no downloads) that the strict
 * Mojang schema drops but collectRepoLibs resurrects.
 */
function lwjgl3ifyVersionJson() {
  return clientJson('1.7.10', {
    id: '1.7.10-lwjgl3ify',
    libraries: [
      lib('org.lwjgl:lwjgl:3.3.1', 'org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1.jar'),
      // repo-style entry: name + url, no downloads block
      {
        name: 'net.minecraftforge:forge:1.7.10-10.13.4.1614-1.7.10',
        url: 'https://maven.example/',
      },
      // path-less artifact entry: downloads.artifact has url but no path
      {
        name: 'org.lwjgl:lwjgl-opengl:3.4.0',
        downloads: {
          artifact: {
            url: 'https://maven.example/org/lwjgl/lwjgl-opengl/3.4.0/lwjgl-opengl-3.4.0.jar',
            sha1: 'a'.repeat(40),
            size: 200,
          },
        },
      },
    ],
  });
}

function routes(extra: Array<[string, unknown]> = []) {
  return routedFetch([
    ['/repos/GTNewHorizons/lwjgl3ify/releases', lwjgl3ifyReleases()],
    ['/repos/LegacyModdingMC/UniMixins/releases', unimixinsReleases()],
    ['dl/version.json', lwjgl3ifyVersionJson()],
    ['/assets/5.json', ASSET_MANIFEST],
    ...extra,
  ]);
}

describe('resolveLwjgl3ify', () => {
  it('builds a template from the release version.json', async () => {
    routes();
    const t = await resolveLwjgl3ify({ version: '3.0.16' });
    expect(t.vars.version_name).toBe('1.7.10-lwjgl3ify');
    expect(t.launch.command).toBe('${java_bin}');
  });

  it('deploys the lwjgl3ify mod jar into mods/', async () => {
    routes();
    const t = await resolveLwjgl3ify({ version: '3.0.16' });
    const mod = t.artifacts.find((a) =>
      a.path.includes('mods/lwjgl3ify-3.0.16.jar'),
    )!;
    expect(mod.source).toEqual({
      kind: 'url',
      url: 'https://gh/dl/lwjgl3ify-3.0.16.jar',
    });
    expect(mod.integrity).toEqual({ sha256: 'modhash' });
  });

  it('deploys the UniMixins jar into mods/ by default', async () => {
    routes();
    const t = await resolveLwjgl3ify({ version: '3.0.16' });
    const um = t.artifacts.find((a) => a.path.includes('unimixins-all'))!;
    expect(um.path).toContain('mods/+unimixins-all-1.7.10-1.0.0.jar');
    expect(um.integrity).toEqual({ sha256: 'umhash' });
  });

  it('resurrects repo-style libraries the strict schema drops', async () => {
    routes();
    const t = await resolveLwjgl3ify({ version: '3.0.16' });
    expect(
      t.artifacts.some(
        (a) =>
          a.path.includes('net/minecraftforge/forge') &&
          a.path.includes('1.7.10-10.13.4.1614-1.7.10'),
      ),
    ).toBe(true);
  });

  it('augments the classpath with repo-lib paths', async () => {
    routes();
    const t = await resolveLwjgl3ify({ version: '3.0.16' });
    const cp = t.vars.classpath as readonly { value: string }[];
    expect(
      cp.every((arm) => arm.value.includes('net/minecraftforge/forge')),
    ).toBe(true);
  });

  it('synthesizes a path for path-less artifact entries', async () => {
    routes();
    const t = await resolveLwjgl3ify({ version: '3.0.16' });
    expect(
      t.artifacts.some((a) => a.path.includes('org/lwjgl/lwjgl-opengl/3.4.0')),
    ).toBe(true);
  });

  it('skips a repo-style entry whose name carries no version', async () => {
    routedFetch([
      ['/repos/GTNewHorizons/lwjgl3ify/releases', lwjgl3ifyReleases()],
      [
        'dl/version.json',
        clientJson('1.7.10', {
          id: '1.7.10-lwjgl3ify',
          libraries: [
            lib('org.lwjgl:lwjgl:3.3.1', 'org/lwjgl/lwjgl/3.3.1/lwjgl.jar'),
            // repo-style entry: parseable coord but no version → skipped
            { name: 'org.example:thing', url: 'https://maven.example/' },
          ],
        }),
      ],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    const t = await resolveLwjgl3ify({
      version: '3.0.16',
      unimixins: false,
    });
    expect(t.artifacts.some((a) => a.path.includes('maven.example'))).toBe(
      false,
    );
  });

  it('skips UniMixins when unimixins is false', async () => {
    routes();
    const t = await resolveLwjgl3ify({
      version: '3.0.16',
      unimixins: false,
    });
    expect(t.artifacts.some((a) => a.path.includes('unimixins'))).toBe(false);
  });

  it('honours a custom UniMixins version', async () => {
    routedFetch([
      ['/repos/GTNewHorizons/lwjgl3ify/releases', lwjgl3ifyReleases()],
      ['/repos/LegacyModdingMC/UniMixins/releases', unimixinsReleases('2.0.0')],
      ['dl/version.json', lwjgl3ifyVersionJson()],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    const t = await resolveLwjgl3ify({
      version: '3.0.16',
      unimixins: { version: '2.0.0' },
    });
    expect(
      t.artifacts.some((a) =>
        a.path.includes('+unimixins-all-1.7.10-2.0.0.jar'),
      ),
    ).toBe(true);
  });

  it('throws when the version.json fetch is not ok', async () => {
    routedFetch([
      ['/repos/GTNewHorizons/lwjgl3ify/releases', lwjgl3ifyReleases()],
      ['dl/version.json', new Response('gone', { status: 404 })],
    ]);
    await expect(resolveLwjgl3ify({ version: '3.0.16' })).rejects.toThrow(
      /Failed to fetch lwjgl3ify version.json/,
    );
  });

  it('throws when UniMixins has no matching release', async () => {
    routedFetch([
      ['/repos/GTNewHorizons/lwjgl3ify/releases', lwjgl3ifyReleases()],
      ['/repos/LegacyModdingMC/UniMixins/releases', []],
      ['dl/version.json', lwjgl3ifyVersionJson()],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    await expect(
      resolveLwjgl3ify({ version: '3.0.16', unimixins: { version: 'x' } }),
    ).rejects.toThrow(/UniMixins release 'x' not found/);
  });

  it('throws when no UniMixins asset is on the release', async () => {
    routedFetch([
      ['/repos/GTNewHorizons/lwjgl3ify/releases', lwjgl3ifyReleases()],
      [
        '/repos/LegacyModdingMC/UniMixins/releases',
        [
          {
            tag_name: '1.0.0',
            prerelease: false,
            draft: false,
            assets: [
              {
                name: 'something-else.jar',
                size: 1,
                browser_download_url: 'https://x/se.jar',
              },
            ],
          },
        ],
      ],
      ['dl/version.json', lwjgl3ifyVersionJson()],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    await expect(resolveLwjgl3ify({ version: '3.0.16' })).rejects.toThrow(
      /No `\+unimixins-all/,
    );
  });

  it('resolves UniMixins by prerelease selector', async () => {
    routedFetch([
      ['/repos/GTNewHorizons/lwjgl3ify/releases', lwjgl3ifyReleases()],
      ['/repos/LegacyModdingMC/UniMixins/releases', unimixinsReleases('9.9.9')],
      ['dl/version.json', lwjgl3ifyVersionJson()],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    const t = await resolveLwjgl3ify({
      version: '3.0.16',
      unimixins: { version: 'prerelease' },
    });
    expect(t.artifacts.some((a) => a.path.includes('9.9.9'))).toBe(true);
  });

  it('throws when the UniMixins GitHub API errors', async () => {
    routedFetch([
      ['/repos/GTNewHorizons/lwjgl3ify/releases', lwjgl3ifyReleases()],
      [
        '/repos/LegacyModdingMC/UniMixins/releases',
        new Response('x', { status: 404 }),
      ],
      ['dl/version.json', lwjgl3ifyVersionJson()],
      ['/assets/5.json', ASSET_MANIFEST],
    ]);
    await expect(resolveLwjgl3ify({ version: '3.0.16' })).rejects.toThrow(
      /GitHub API 404/,
    );
  });
});
