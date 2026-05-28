import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchVersionManifest,
  findVersion,
  latestRelease,
  VersionFetchError,
  VERSION_MANIFEST_URL,
  type VersionManifest,
} from '../../lib/version';

afterEach(() => vi.unstubAllGlobals());

const version = (id: string, type = 'release') => ({
  id,
  type,
  url: `https://meta/${id}.json`,
  time: '2024-01-01T00:00:00+00:00',
  releaseTime: '2024-01-01T00:00:00+00:00',
  sha1: 'a'.repeat(40),
  complianceLevel: 1,
});

const manifest: VersionManifest = {
  latest: { release: '1.20.1', snapshot: '24w01a' },
  versions: [version('1.20.1'), version('24w01a', 'snapshot')],
};

describe('VERSION_MANIFEST_URL', () => {
  it('points at the v2 Mojang manifest', () => {
    expect(VERSION_MANIFEST_URL).toContain('version_manifest_v2.json');
  });
});

describe('fetchVersionManifest', () => {
  it('fetches and parses the manifest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(manifest))),
    );
    const result = await fetchVersionManifest();
    expect(result.latest.release).toBe('1.20.1');
    expect(result.versions).toHaveLength(2);
  });

  it('uses the default URL when none is given', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(manifest)));
    vi.stubGlobal('fetch', fetchMock);
    await fetchVersionManifest();
    expect(fetchMock.mock.calls[0]![0]).toBe(VERSION_MANIFEST_URL);
  });

  it('throws VersionFetchError on an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 404 })),
    );
    await expect(fetchVersionManifest('https://x')).rejects.toBeInstanceOf(
      VersionFetchError,
    );
  });

  it('carries the status and url on the error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 404 })),
    );
    const err = await fetchVersionManifest('https://x').catch((e) => e);
    expect(err).toBeInstanceOf(VersionFetchError);
    expect(err.status).toBe(404);
    expect(err.url).toBe('https://x');
    expect(err.kind).toBe('version-fetch');
  });

  it('rejects a malformed manifest payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ bad: true }))),
    );
    await expect(fetchVersionManifest('https://x')).rejects.toThrow();
  });
});

describe('findVersion', () => {
  it('finds a version by id', () => {
    expect(findVersion(manifest, '1.20.1')?.id).toBe('1.20.1');
  });

  it('returns undefined for an unknown id', () => {
    expect(findVersion(manifest, '9.9.9')).toBeUndefined();
  });
});

describe('latestRelease', () => {
  it('returns the version named by latest.release', () => {
    expect(latestRelease(manifest).id).toBe('1.20.1');
  });

  it('throws when the release is missing from versions', () => {
    const broken: VersionManifest = {
      latest: { release: 'missing', snapshot: 's' },
      versions: [version('1.20.1')],
    };
    expect(() => latestRelease(broken)).toThrow(/No release version/);
  });
});
