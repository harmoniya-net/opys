import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveModrinth } from '../../lib/template';

afterEach(() => vi.unstubAllGlobals());

function mrFile(
  id: string,
  extra: Partial<{
    filename: string;
    url: string;
    primary: boolean;
    size: number;
    hashes: { sha1?: string; sha512?: string };
  }> = {},
) {
  return {
    filename: extra.filename ?? `mod-${id}.jar`,
    url: extra.url ?? `https://cdn.modrinth.com/${id}.jar`,
    primary: extra.primary ?? true,
    size: extra.size ?? 2048,
    hashes: extra.hashes ?? { sha1: `sha1-${id}`, sha512: `sha512-${id}` },
  };
}

function mrVersion(
  id: string,
  extra: Partial<{
    project_id: string;
    version_number: string;
    files: ReturnType<typeof mrFile>[];
  }> = {},
) {
  return {
    id,
    project_id: extra.project_id ?? `proj-${id}`,
    version_number: extra.version_number ?? `1.0-${id}`,
    files: extra.files ?? [mrFile(id)],
  };
}

function mockVersions(versions: unknown[], status = 200) {
  const fn = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(versions), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const opts = {
  path: (info: { filename: string }) => `mods/${info.filename}`,
};

describe('resolveModrinth', () => {
  it('resolves version ids into url artifacts', async () => {
    mockVersions([mrVersion('AAA')]);
    const arts = await resolveModrinth(opts, ['AAA']);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.path).toBe('mods/mod-AAA.jar');
    expect(arts[0]!.source).toEqual({
      kind: 'url',
      url: 'https://cdn.modrinth.com/AAA.jar',
    });
    expect(arts[0]!.size).toBe(2048);
    expect(arts[0]!.integrity).toEqual({ sha1: 'sha1-AAA' });
  });

  it('parses a /version/<id> URL ref into a version id', async () => {
    mockVersions([mrVersion('BBB')]);
    const arts = await resolveModrinth(opts, [
      'https://modrinth.com/mod/sodium/version/BBB',
    ]);
    expect(arts[0]!.path).toBe('mods/mod-BBB.jar');
  });

  it('throws on a URL ref with no /version/<id> segment', async () => {
    mockVersions([]);
    await expect(
      resolveModrinth(opts, ['https://example.com/not-a-version']),
    ).rejects.toThrow(/does not contain "\/version\/<id>"/);
  });

  it('passes filename, versionId, projectId, versionNumber and size to the path callback', async () => {
    mockVersions([
      mrVersion('CCC', {
        project_id: 'p9',
        version_number: 'mc1.20.1-2.3',
        files: [mrFile('CCC', { size: 64 })],
      }),
    ]);
    const seen: unknown[] = [];
    await resolveModrinth(
      {
        path: (info) => {
          seen.push(info);
          return info.filename;
        },
      },
      ['CCC'],
    );
    expect(seen[0]).toEqual({
      filename: 'mod-CCC.jar',
      versionId: 'CCC',
      projectId: 'p9',
      versionNumber: 'mc1.20.1-2.3',
      size: 64,
    });
  });

  it('selects the primary file when a version has several', async () => {
    mockVersions([
      mrVersion('DDD', {
        files: [
          mrFile('DDD', { filename: 'sources.jar', primary: false }),
          mrFile('DDD', { filename: 'mod.jar', primary: true }),
        ],
      }),
    ]);
    const arts = await resolveModrinth(opts, ['DDD']);
    expect(arts[0]!.path).toBe('mods/mod.jar');
  });

  it('falls back to the first file when none is marked primary', async () => {
    mockVersions([
      mrVersion('EEE', {
        files: [
          mrFile('EEE', { filename: 'first.jar', primary: false }),
          mrFile('EEE', { filename: 'second.jar', primary: false }),
        ],
      }),
    ]);
    const arts = await resolveModrinth(opts, ['EEE']);
    expect(arts[0]!.path).toBe('mods/first.jar');
  });

  it('omits integrity when the primary file has no sha1 hash', async () => {
    mockVersions([
      mrVersion('FFF', { files: [mrFile('FFF', { hashes: { sha512: 'x' } })] }),
    ]);
    const arts = await resolveModrinth(opts, ['FFF']);
    expect(arts[0]!.integrity).toBeUndefined();
  });

  it('preserves the order of the input refs', async () => {
    // API returns versions in a different order than requested.
    mockVersions([mrVersion('b'), mrVersion('a'), mrVersion('c')]);
    const arts = await resolveModrinth(opts, ['a', 'b', 'c']);
    expect(arts.map((a) => a.path)).toEqual([
      'mods/mod-a.jar',
      'mods/mod-b.jar',
      'mods/mod-c.jar',
    ]);
  });

  it('throws when the API omits metadata for a requested version', async () => {
    mockVersions([mrVersion('a')]);
    await expect(resolveModrinth(opts, ['a', 'b'])).rejects.toThrow(
      /did not return metadata for version b/,
    );
  });

  it('throws when a version has no files', async () => {
    mockVersions([mrVersion('GGG', { files: [] })]);
    await expect(resolveModrinth(opts, ['GGG'])).rejects.toThrow(
      /version GGG has no downloadable files/,
    );
  });

  it('throws on a non-ok API response', async () => {
    mockVersions([], 410);
    await expect(resolveModrinth(opts, ['a'])).rejects.toThrow(
      /Modrinth API 410/,
    );
  });

  it('sends the requested ids in the query string', async () => {
    const fn = mockVersions([mrVersion('a')]);
    await resolveModrinth(opts, ['a']);
    const url = fn.mock.calls[0]![0] as string;
    const ids = new URL(url).searchParams.get('ids');
    expect(JSON.parse(ids!)).toEqual(['a']);
  });

  it('batches more than 100 version ids into multiple requests', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `v${i}`);
    const fn = vi.fn(async (url: string) => {
      const batch = JSON.parse(
        new URL(url).searchParams.get('ids')!,
      ) as string[];
      return new Response(JSON.stringify(batch.map((id) => mrVersion(id))));
    });
    vi.stubGlobal('fetch', fn);
    const arts = await resolveModrinth(opts, ids);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(arts).toHaveLength(150);
  });

  it('returns an empty list for no versions', async () => {
    const fn = mockVersions([]);
    expect(await resolveModrinth(opts, [])).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
});
