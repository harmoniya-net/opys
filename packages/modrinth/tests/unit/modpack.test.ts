import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { loaderSpec, resolveModrinthModpack } from '../../lib/modpack';

afterEach(() => vi.unstubAllGlobals());

describe('loaderSpec', () => {
  it('maps fabric-loader to a fabric spec', () => {
    expect(
      loaderSpec({ minecraft: '1.20.1', 'fabric-loader': '0.15.11' }),
    ).toEqual({
      loader: 'fabric',
      minecraft: '1.20.1',
      fabricLoader: '0.15.11',
    });
  });

  it('fuses minecraft + forge into one forge version string', () => {
    expect(loaderSpec({ minecraft: '1.20.1', forge: '47.4.20' })).toEqual({
      loader: 'forge',
      version: '1.20.1-47.4.20',
    });
  });

  it('passes the neoforge version through (it derives its own MC)', () => {
    expect(loaderSpec({ minecraft: '1.21.1', neoforge: '21.1.172' })).toEqual({
      loader: 'neoforge',
      version: '21.1.172',
    });
  });

  it('falls back to vanilla when no loader is present', () => {
    expect(loaderSpec({ minecraft: '1.20.1' })).toEqual({
      loader: 'vanilla',
      minecraft: '1.20.1',
    });
  });

  it('rejects quilt modpacks', () => {
    expect(() =>
      loaderSpec({ minecraft: '1.20.1', 'quilt-loader': '0.26.0' }),
    ).toThrow(/Quilt/);
  });

  it('throws when the minecraft dependency is missing', () => {
    expect(() => loaderSpec({ 'fabric-loader': '0.15.11' })).toThrow(
      /missing its "minecraft"/,
    );
  });
});

const INDEX = {
  formatVersion: 1,
  game: 'minecraft',
  versionId: '1.0.0',
  name: 'Test Pack',
  dependencies: { minecraft: '1.20.1', 'fabric-loader': '0.15.11' },
  files: [
    {
      path: 'mods/sodium.jar',
      hashes: { sha1: 'aaa', sha512: 'bbb' },
      env: { client: 'required', server: 'required' },
      downloads: ['https://cdn.modrinth.com/sodium.jar'],
      fileSize: 100,
    },
    {
      path: 'mods/server-only.jar',
      hashes: { sha1: 'ccc' },
      env: { client: 'unsupported', server: 'required' },
      downloads: ['https://cdn.modrinth.com/server.jar'],
      fileSize: 50,
    },
    {
      path: 'resourcepacks/pack.zip',
      hashes: { sha1: 'ddd' },
      downloads: ['https://cdn.modrinth.com/rp.zip'],
      fileSize: 25,
    },
  ],
};

function mrpackBytes(index: unknown = INDEX) {
  return zipSync({
    'modrinth.index.json': strToU8(JSON.stringify(index)),
    'overrides/config/foo.txt': strToU8('hi'),
  });
}

/** Route the API `/version/<id>` call and the `.mrpack` download. */
function mockModpack(zip: Uint8Array, versionFiles?: unknown[]) {
  const fn = vi.fn(async (url: string) => {
    if (url.includes('/version/')) {
      return new Response(
        JSON.stringify({
          files: versionFiles ?? [
            {
              url: 'https://cdn.modrinth.com/pack.mrpack',
              filename: 'pack.mrpack',
              primary: true,
            },
          ],
        }),
      );
    }
    return new Response(zip);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('resolveModrinthModpack', () => {
  it('resolves a version id into client file artifacts + overrides', async () => {
    mockModpack(mrpackBytes());
    const pack = await resolveModrinthModpack('xVcA1pSL');

    expect(pack.dependencies).toEqual({
      minecraft: '1.20.1',
      'fabric-loader': '0.15.11',
    });

    // server-only file dropped; mod + resourcepack kept.
    expect(pack.files.map((a) => a.path)).toEqual([
      '${game_directory}/mods/sodium.jar',
      '${game_directory}/resourcepacks/pack.zip',
    ]);
    expect(pack.files[0]!.source).toEqual({
      kind: 'url',
      url: 'https://cdn.modrinth.com/sodium.jar',
    });
    expect(pack.files[0]!.integrity).toEqual({ sha1: 'aaa' });
    expect(pack.files[0]!.size).toBe(100);
  });

  it('builds an overrides artifact that extracts overrides/ + client-overrides/', async () => {
    mockModpack(mrpackBytes());
    const { overrides } = await resolveModrinthModpack('xVcA1pSL');

    expect(overrides.path).toBe('${root}/cache/modrinth-modpack.mrpack');
    expect(overrides.source).toEqual({
      kind: 'url',
      url: 'https://cdn.modrinth.com/pack.mrpack',
    });
    expect(overrides.integrity).toMatchObject({
      sha1: expect.stringMatching(/^[0-9a-f]{40}$/),
    });
    expect(overrides.extract).toEqual([
      {
        kind: 'scan',
        matches: 'overrides/',
        into: '${game_directory}',
        strip: ['overrides/'],
      },
      {
        kind: 'scan',
        matches: 'client-overrides/',
        into: '${game_directory}',
        strip: ['client-overrides/'],
      },
    ]);
  });

  it('omits integrity for a file with no sha1', async () => {
    const index = {
      ...INDEX,
      files: [
        {
          path: 'mods/x.jar',
          hashes: { sha512: 'only512' },
          downloads: ['https://cdn.modrinth.com/x.jar'],
          fileSize: 1,
        },
      ],
    };
    mockModpack(mrpackBytes(index));
    const pack = await resolveModrinthModpack('xVcA1pSL');
    expect(pack.files[0]!.integrity).toBeUndefined();
  });

  it('accepts a direct .mrpack URL without hitting the version API', async () => {
    const fn = mockModpack(mrpackBytes());
    await resolveModrinthModpack('https://cdn.modrinth.com/pack.mrpack');
    // Only the download happened — no /version/ lookup.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toBe('https://cdn.modrinth.com/pack.mrpack');
  });

  it('throws when a version has no .mrpack file', async () => {
    mockModpack(mrpackBytes(), [
      {
        url: 'https://cdn/notapack.jar',
        filename: 'notapack.jar',
        primary: true,
      },
    ]);
    await expect(resolveModrinthModpack('xVcA1pSL')).rejects.toThrow(
      /has no .mrpack file/,
    );
  });

  it('throws on a non-mrpack URL ref', async () => {
    mockModpack(mrpackBytes());
    await expect(
      resolveModrinthModpack('https://example.com/whatever'),
    ).rejects.toThrow(/neither a .mrpack file nor a \/version\/<id>/);
  });
});
