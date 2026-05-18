import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCurseforge } from '../../lib/curseforge/template';

afterEach(() => vi.unstubAllGlobals());

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
    hashes: extra.hashes ?? [{ value: 'sha1hex', algo: 1 }],
    downloadUrl:
      extra.downloadUrl === undefined
        ? `https://cdn/mod-${id}.jar`
        : extra.downloadUrl,
  };
}

function mockFiles(files: unknown[], status = 200) {
  const fn = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: files }), { status }),
    );
  vi.stubGlobal('fetch', fn);
  return fn;
}

const opts = {
  token: 'cf-key',
  path: (info: { filename: string }) => `mods/${info.filename}`,
};

describe('resolveCurseforge', () => {
  it('resolves numeric file ids into url artifacts', async () => {
    mockFiles([cfFile(111)]);
    const arts = await resolveCurseforge(opts, [111]);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.path).toBe('mods/mod-111.jar');
    expect(arts[0]!.source).toEqual({
      kind: 'url',
      url: 'https://cdn/mod-111.jar',
    });
    expect(arts[0]!.size).toBe(2048);
    expect(arts[0]!.integrity).toEqual({ sha1: 'sha1hex' });
  });

  it('parses a /files/<id> URL ref into a numeric id', async () => {
    mockFiles([cfFile(222)]);
    const arts = await resolveCurseforge(opts, [
      'https://www.curseforge.com/minecraft/mc-mods/jei/files/222',
    ]);
    expect(arts[0]!.path).toBe('mods/mod-222.jar');
  });

  it('throws on a string ref with no /files/<id> segment', async () => {
    mockFiles([]);
    await expect(
      resolveCurseforge(opts, ['https://example.com/not-a-file']),
    ).rejects.toThrow(/does not contain "\/files\/<id>"/);
  });

  it('passes filename, fileId, projectId and size to the path callback', async () => {
    mockFiles([cfFile(333, { modId: 9000, fileLength: 64 })]);
    const seen: unknown[] = [];
    await resolveCurseforge(
      {
        token: 't',
        path: (info) => {
          seen.push(info);
          return info.filename;
        },
      },
      [333],
    );
    expect(seen[0]).toEqual({
      filename: 'mod-333.jar',
      fileId: 333,
      projectId: 9000,
      size: 64,
    });
  });

  it('falls back to the forgecdn URL when downloadUrl is null', async () => {
    mockFiles([
      cfFile(1234567, { fileName: 'big mod.jar', downloadUrl: null }),
    ]);
    const arts = await resolveCurseforge(opts, [1234567]);
    expect(arts[0]!.source).toEqual({
      kind: 'url',
      url: 'https://edge.forgecdn.net/files/1234/567/big%20mod.jar',
    });
  });

  it('omits integrity when no sha1 hash is present', async () => {
    mockFiles([cfFile(444, { hashes: [{ value: 'md5hex', algo: 2 }] })]);
    const arts = await resolveCurseforge(opts, [444]);
    expect(arts[0]!.integrity).toBeUndefined();
  });

  it('preserves the order of the input refs', async () => {
    // API returns files in a different order than requested.
    mockFiles([cfFile(2), cfFile(1), cfFile(3)]);
    const arts = await resolveCurseforge(opts, [1, 2, 3]);
    expect(arts.map((a) => a.path)).toEqual([
      'mods/mod-1.jar',
      'mods/mod-2.jar',
      'mods/mod-3.jar',
    ]);
  });

  it('throws when the API omits metadata for a requested file', async () => {
    mockFiles([cfFile(1)]);
    await expect(resolveCurseforge(opts, [1, 2])).rejects.toThrow(
      /did not return metadata for file 2/,
    );
  });

  it('throws on a non-ok API response', async () => {
    mockFiles([], 403);
    await expect(resolveCurseforge(opts, [1])).rejects.toThrow(
      /CurseForge API 403/,
    );
  });

  it('sends the API token in the x-api-key header', async () => {
    const fn = mockFiles([cfFile(1)]);
    await resolveCurseforge(opts, [1]);
    const init = fn.mock.calls[0]![1] as {
      headers: Headers;
      body: string;
    };
    expect(new Headers(init.headers).get('x-api-key')).toBe('cf-key');
    expect(JSON.parse(init.body)).toEqual({ fileIds: [1] });
  });

  it('batches more than 200 file ids into multiple requests', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => i + 1);
    const fn = vi.fn(async (_url: string, init: RequestInit) => {
      const { fileIds } = JSON.parse(init.body as string) as {
        fileIds: number[];
      };
      return new Response(
        JSON.stringify({ data: fileIds.map((id) => cfFile(id)) }),
      );
    });
    vi.stubGlobal('fetch', fn);
    const arts = await resolveCurseforge(opts, ids);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(arts).toHaveLength(250);
  });

  it('returns an empty list for no files', async () => {
    mockFiles([]);
    expect(await resolveCurseforge(opts, [])).toEqual([]);
  });
});
