import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  loaderSpecFromManifest,
  resolveCurseforgeModpack,
  type CurseforgeModLoader,
  type CurseforgeModpackManifest,
} from '../../lib/modpack';

afterEach(() => vi.unstubAllGlobals());

function manifest(
  modLoaders: CurseforgeModLoader[],
  version = '1.20.1',
): CurseforgeModpackManifest {
  return {
    minecraft: { version, modLoaders },
    files: [],
    overrides: 'overrides',
    name: 'X',
  };
}

describe('loaderSpecFromManifest', () => {
  it('fuses minecraft + forge into one forge version string', () => {
    expect(
      loaderSpecFromManifest(
        manifest([{ id: 'forge-47.4.20', primary: true }]),
      ),
    ).toEqual({ loader: 'forge', version: '1.20.1-47.4.20' });
  });

  it('maps fabric to a fabric spec', () => {
    expect(
      loaderSpecFromManifest(
        manifest([{ id: 'fabric-0.15.11', primary: true }]),
      ),
    ).toEqual({
      loader: 'fabric',
      minecraft: '1.20.1',
      fabricLoader: '0.15.11',
    });
  });

  it('passes the neoforge version through', () => {
    expect(
      loaderSpecFromManifest(
        manifest([{ id: 'neoforge-21.1.172', primary: true }], '1.21.1'),
      ),
    ).toEqual({ loader: 'neoforge', version: '21.1.172' });
  });

  it('uses the primary loader when several are listed', () => {
    expect(
      loaderSpecFromManifest(
        manifest([
          { id: 'fabric-0.15.11' },
          { id: 'forge-47.4.20', primary: true },
        ]),
      ),
    ).toEqual({ loader: 'forge', version: '1.20.1-47.4.20' });
  });

  it('rejects quilt modpacks', () => {
    expect(() =>
      loaderSpecFromManifest(manifest([{ id: 'quilt-0.26.0', primary: true }])),
    ).toThrow(/Quilt/);
  });

  it('throws when there is no mod loader', () => {
    expect(() => loaderSpecFromManifest(manifest([]))).toThrow(/no mod loader/);
  });

  it('throws on an unknown mod loader', () => {
    expect(() =>
      loaderSpecFromManifest(manifest([{ id: 'weird-1.0', primary: true }])),
    ).toThrow(/Unknown CurseForge mod loader/);
  });
});

function cfFile(
  id: number,
  extra: Partial<{
    modId: number;
    fileName: string;
    fileLength: number;
    hashes: { value: string; algo: number }[];
    downloadUrl: string | null;
  }> = {},
) {
  return {
    id,
    modId: extra.modId ?? 1000 + id,
    fileName: extra.fileName ?? `mod-${id}.jar`,
    fileLength: extra.fileLength ?? 2048,
    hashes: extra.hashes ?? [{ value: `sha1-${id}`, algo: 1 }],
    downloadUrl:
      extra.downloadUrl === undefined
        ? `https://cdn/mod-${id}.jar`
        : extra.downloadUrl,
  };
}

const MANIFEST = {
  minecraft: {
    version: '1.20.1',
    modLoaders: [{ id: 'forge-47.4.20', primary: true }],
  },
  files: [
    { projectID: 1, fileID: 111, required: true },
    { projectID: 2, fileID: 222, required: true },
  ],
  overrides: 'overrides',
  name: 'Test CF Pack',
  version: '1.0',
};

function modpackZip(m: unknown = MANIFEST) {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify(m)),
    'overrides/config/foo.txt': strToU8('hi'),
  });
}

/** Route the `/mods/files` metadata POSTs and the modpack `.zip` download. */
function mockModpack(zip: Uint8Array, rows: Record<number, unknown>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/mods/files')) {
      const { fileIds } = JSON.parse(init!.body as string) as {
        fileIds: number[];
      };
      return new Response(
        JSON.stringify({ data: fileIds.map((id) => rows[id]).filter(Boolean) }),
      );
    }
    return new Response(zip);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('resolveCurseforgeModpack', () => {
  const baseRows = {
    9999: cfFile(9999, {
      fileName: 'pack.zip',
      downloadUrl: 'https://cdn/pack.zip',
    }),
    111: cfFile(111, { fileName: 'sodium.jar', modId: 1 }),
    222: cfFile(222, { fileName: 'lithium.jar', modId: 2 }),
  };

  it('resolves the pack into mods/ artifacts + overrides', async () => {
    mockModpack(modpackZip(), baseRows);
    const pack = await resolveCurseforgeModpack({ token: 't' }, 9999);

    expect(pack.manifest.name).toBe('Test CF Pack');
    expect(loaderSpecFromManifest(pack.manifest)).toEqual({
      loader: 'forge',
      version: '1.20.1-47.4.20',
    });

    expect(pack.files.map((a) => a.path)).toEqual([
      '${game_directory}/mods/sodium.jar',
      '${game_directory}/mods/lithium.jar',
    ]);
    expect(pack.files[0]!.source).toEqual({
      kind: 'url',
      url: 'https://cdn/mod-111.jar',
    });
    expect(pack.files[0]!.integrity).toEqual({ sha1: 'sha1-111' });
    expect(pack.files[0]!.size).toBe(2048);
  });

  it('builds an overrides artifact that extracts overrides/', async () => {
    mockModpack(modpackZip(), baseRows);
    const { overrides } = await resolveCurseforgeModpack({ token: 't' }, 9999);

    expect(overrides.path).toBe('${root}/cache/curseforge-modpack.zip');
    expect(overrides.source).toEqual({
      kind: 'url',
      url: 'https://cdn/pack.zip',
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
    ]);
  });

  it('parses a /files/<id> URL modpack ref', async () => {
    mockModpack(modpackZip(), baseRows);
    const pack = await resolveCurseforgeModpack(
      { token: 't' },
      'https://www.curseforge.com/minecraft/modpacks/x/files/9999',
    );
    expect(pack.files).toHaveLength(2);
  });

  it('falls back to the forgecdn URL for a mod with no downloadUrl', async () => {
    const m = {
      ...MANIFEST,
      files: [{ projectID: 3, fileID: 1234567, required: true }],
    };
    mockModpack(modpackZip(m), {
      9999: baseRows[9999],
      1234567: cfFile(1234567, { fileName: 'big mod.jar', downloadUrl: null }),
    });
    const pack = await resolveCurseforgeModpack({ token: 't' }, 9999);
    expect(pack.files[0]!.source).toEqual({
      kind: 'url',
      url: 'https://edge.forgecdn.net/files/1234/567/big%20mod.jar',
    });
  });

  it('throws when the API omits a referenced mod file', async () => {
    const m = {
      ...MANIFEST,
      files: [{ projectID: 9, fileID: 444, required: true }],
    };
    mockModpack(modpackZip(m), { 9999: baseRows[9999] });
    await expect(
      resolveCurseforgeModpack({ token: 't' }, 9999),
    ).rejects.toThrow(/did not return metadata for modpack file 444/);
  });
});
