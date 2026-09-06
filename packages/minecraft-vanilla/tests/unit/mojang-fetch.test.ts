/**
 * Ported from `@opys/mojang`'s version/asset suites when fetching moved here:
 * `@opys/mojang` is now a pure parser and performs no I/O.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchVersionManifest,
  fetchAssetManifest,
  VersionFetchError,
  VERSION_MANIFEST_URL,
} from '../../lib/mojang-fetch';

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

const manifest = {
  latest: { release: '1.20.1', snapshot: '24w01a' },
  versions: [version('1.20.1'), version('24w01a', 'snapshot')],
};

const respond = (body: unknown, init?: ResponseInit) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), init)),
  );

describe('fetchVersionManifest', () => {
  it('fetches and parses the manifest', async () => {
    respond(manifest);
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

  it('carries the status, url and kind on the error', async () => {
    respond('nope', { status: 404 });
    const err = await fetchVersionManifest('https://x').catch((e) => e);
    expect(err).toBeInstanceOf(VersionFetchError);
    expect(err.status).toBe(404);
    expect(err.url).toBe('https://x');
    expect(err.kind).toBe('version-fetch');
  });

  it('rejects a malformed manifest payload', async () => {
    respond({ bad: true });
    await expect(fetchVersionManifest('https://x')).rejects.toThrow();
  });
});

describe('fetchAssetManifest', () => {
  it('fetches and parses the asset manifest', async () => {
    respond({ objects: { 'a/b.png': { hash: 'abc123', size: 12 } } });
    const result = await fetchAssetManifest('https://assets');
    expect(result.objects['a/b.png']).toEqual({ hash: 'abc123', size: 12 });
  });

  it('throws on an HTTP error', async () => {
    respond('nope', { status: 500 });
    await expect(fetchAssetManifest('https://assets')).rejects.toThrow();
  });
});
