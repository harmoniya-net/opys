import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sourceString,
  sourceUrl,
  type Artifact,
  type Manifest,
} from '@torba/core';
import { resolveDiscovery } from '../../lib/phases/resolve-discovery';
import { currentPlatform } from '../../lib/platform';

const PLATFORM = currentPlatform();
const ARTIFACT_URL = 'https://host.example/pack.zip';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function manifestOf(artifacts: Artifact[]): Manifest {
  return { vars: {}, artifacts };
}

interface StubResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
}

/** Stub `fetch` with a `${method} ${url}` → response lookup table. */
function stubFetch(table: Record<string, StubResponse>): void {
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.href;
    const key = `${init?.method ?? 'GET'} ${url}`;
    const r = table[key];
    if (!r) return new Response('not found', { status: 404 });
    return new Response(r.body ?? '', {
      status: r.status ?? 200,
      headers: r.headers,
    });
  });
}

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'unipack-discovery-test-'));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(tmpDir, { recursive: true, force: true });
});

function urlArtifact(extra: Partial<Artifact> = {}): Artifact {
  return {
    path: join(tmpDir, 'pack.zip'),
    source: sourceUrl(ARTIFACT_URL),
    rules: [],
    ...extra,
  };
}

describe('resolveDiscovery', () => {
  it('leaves artifacts without a discovery block untouched', async () => {
    const artifact = urlArtifact();
    const { manifest, refetch } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]).toEqual(artifact);
    expect(refetch.size).toBe(0);
  });

  it('discovers the hash from a sibling checksum URL', async () => {
    const hash = sha256('the pack bytes');
    stubFetch({
      [`GET ${ARTIFACT_URL}.sha256`]: { body: `${hash}  pack.zip\n` },
    });
    const artifact = urlArtifact({
      discovery: { integrity: { url: { sha256: '${url}.sha256' } } },
    });
    const { manifest } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.integrity).toEqual({ sha256: hash });
  });

  it('picks the right line out of a SHA256SUMS list by filename', async () => {
    const wanted = sha256('pack bytes');
    const other = sha256('something else');
    stubFetch({
      [`GET https://host.example/SHA256SUMS`]: {
        body: `${other}  other.zip\n${wanted}  pack.zip\n`,
      },
    });
    const artifact = urlArtifact({
      discovery: {
        integrity: { url: { sha256: 'https://host.example/SHA256SUMS' } },
      },
    });
    const { manifest } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.integrity).toEqual({ sha256: wanted });
  });

  it('discovers the hash from a response header (RFC 9530 base64)', async () => {
    const content = 'header-borne pack';
    const b64 = createHash('sha256').update(content).digest('base64');
    stubFetch({
      [`HEAD ${ARTIFACT_URL}`]: {
        headers: { 'repr-digest': `sha-256=:${b64}:` },
      },
    });
    const artifact = urlArtifact({
      discovery: { integrity: { header: { sha256: 'Repr-Digest' } } },
    });
    const { manifest } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.integrity).toEqual({
      sha256: sha256(content),
    });
  });

  it('falls back to the url probe when the header is absent', async () => {
    const hash = sha256('fallback pack');
    stubFetch({
      [`HEAD ${ARTIFACT_URL}`]: { headers: {} },
      [`GET ${ARTIFACT_URL}.sha256`]: { body: hash },
    });
    const artifact = urlArtifact({
      discovery: {
        integrity: {
          header: { sha256: 'Repr-Digest' },
          url: { sha256: '${url}.sha256' },
        },
      },
    });
    const { manifest } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.integrity).toEqual({ sha256: hash });
  });

  it('discovers size from a response header', async () => {
    stubFetch({
      [`HEAD ${ARTIFACT_URL}`]: { headers: { 'content-length': '4096' } },
    });
    const artifact = urlArtifact({
      discovery: { size: { header: 'Content-Length' } },
    });
    const { manifest } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.size).toBe(4096);
  });

  it('shares one HEAD request for header integrity and size', async () => {
    const content = 'shared head';
    const b64 = createHash('sha256').update(content).digest('base64');
    let headCalls = 0;
    vi.stubGlobal('fetch', async (_input: string | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') headCalls++;
      return new Response('', {
        status: 200,
        headers: { 'repr-digest': `sha-256=:${b64}:`, 'content-length': '12' },
      });
    });
    const artifact = urlArtifact({
      discovery: {
        integrity: { header: { sha256: 'Repr-Digest' } },
        size: { header: 'Content-Length' },
      },
    });
    const { manifest } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(headCalls).toBe(1);
    expect(manifest.artifacts[0]!.integrity).toEqual({
      sha256: sha256(content),
    });
    expect(manifest.artifacts[0]!.size).toBe(12);
  });

  it('interpolates ${var} and ${url} in the url probe', async () => {
    const hash = sha256('en pack');
    stubFetch({
      'GET https://host.example/pack.zip.en.sha256': { body: hash },
    });
    const artifact = urlArtifact({
      discovery: { integrity: { url: { sha256: '${url}.${lang}.sha256' } } },
    });
    const { manifest } = await resolveDiscovery(
      manifestOf([artifact]),
      { lang: 'en' },
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.integrity).toEqual({ sha256: hash });
  });

  describe('freshness', () => {
    it('flags a stale local copy for refetch', async () => {
      const dest = join(tmpDir, 'pack.zip');
      await writeFile(dest, 'old bytes');
      stubFetch({
        [`GET ${ARTIFACT_URL}.sha256`]: { body: sha256('new bytes') },
      });
      const artifact = urlArtifact({
        path: dest,
        discovery: { integrity: { url: { sha256: '${url}.sha256' } } },
      });
      const { refetch } = await resolveDiscovery(
        manifestOf([artifact]),
        {},
        PLATFORM,
      );
      expect(refetch.has(dest)).toBe(true);
    });

    it('keeps a local copy whose hash still matches', async () => {
      const dest = join(tmpDir, 'pack.zip');
      const content = 'current bytes';
      await writeFile(dest, content);
      stubFetch({
        [`GET ${ARTIFACT_URL}.sha256`]: { body: sha256(content) },
      });
      const artifact = urlArtifact({
        path: dest,
        discovery: { integrity: { url: { sha256: '${url}.sha256' } } },
      });
      const { refetch } = await resolveDiscovery(
        manifestOf([artifact]),
        {},
        PLATFORM,
      );
      expect(refetch.has(dest)).toBe(false);
    });
  });

  it('throws when discovery is set on a non-url source', async () => {
    const artifact: Artifact = {
      path: join(tmpDir, 'pack.zip'),
      source: sourceString('inline'),
      rules: [],
      discovery: { integrity: { url: { sha256: 'x' } } },
    };
    await expect(
      resolveDiscovery(manifestOf([artifact]), {}, PLATFORM),
    ).rejects.toThrow(/requires a url source/);
  });

  it('throws when an integrity probe yields no hash', async () => {
    stubFetch({ [`GET ${ARTIFACT_URL}.sha256`]: { body: 'no hash here' } });
    const artifact = urlArtifact({
      discovery: { integrity: { url: { sha256: '${url}.sha256' } } },
    });
    await expect(
      resolveDiscovery(manifestOf([artifact]), {}, PLATFORM),
    ).rejects.toThrow(/Could not discover/);
  });

  it('throws a NetworkError when a checksum URL is unreachable', async () => {
    stubFetch({});
    const artifact = urlArtifact({
      discovery: { integrity: { url: { sha256: '${url}.sha256' } } },
    });
    await expect(
      resolveDiscovery(manifestOf([artifact]), {}, PLATFORM),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('discovers a sha1 hash from a response header', async () => {
    const hex = createHash('sha1').update('sha1 pack').digest('hex');
    stubFetch({
      [`HEAD ${ARTIFACT_URL}`]: { headers: { 'x-sha1': hex } },
    });
    const artifact = urlArtifact({
      discovery: { integrity: { header: { sha1: 'X-Sha1' } } },
    });
    const { manifest } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.integrity).toEqual({ sha1: hex });
  });

  it('discovers an md5 hash from a sibling checksum URL', async () => {
    const hex = createHash('md5').update('md5 pack').digest('hex');
    stubFetch({ [`GET ${ARTIFACT_URL}.md5`]: { body: `${hex}  pack.zip` } });
    const artifact = urlArtifact({
      discovery: { integrity: { url: { md5: '${url}.md5' } } },
    });
    const { manifest } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.integrity).toEqual({ md5: hex });
  });

  it('throws a NetworkError when a HEAD probe fails', async () => {
    stubFetch({ [`HEAD ${ARTIFACT_URL}`]: { status: 500 } });
    const artifact = urlArtifact({
      discovery: { size: { header: 'Content-Length' } },
    });
    await expect(
      resolveDiscovery(manifestOf([artifact]), {}, PLATFORM),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('ignores a non-numeric Content-Length header', async () => {
    stubFetch({
      [`HEAD ${ARTIFACT_URL}`]: { headers: { 'content-length': 'huge' } },
    });
    const artifact = urlArtifact({
      discovery: { size: { header: 'Content-Length' } },
    });
    const { manifest } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.size).toBeUndefined();
  });

  it('skips discovery on an artifact excluded by its rules', async () => {
    const artifact = urlArtifact({
      rules: [{ action: 'disallow' }],
      discovery: { integrity: { url: { sha256: '${url}.sha256' } } },
    });
    const { manifest, refetch } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]).toEqual(artifact);
    expect(refetch.size).toBe(0);
  });

  it('matches a checksum line when the artifact URL is not absolute', async () => {
    const hex = sha256('relative pack');
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.href;
      if (url === 'pack.zip.sha256') {
        return new Response(`${hex}  pack.zip`, { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    const artifact: Artifact = {
      path: join(tmpDir, 'pack.zip'),
      source: sourceUrl('pack.zip'),
      rules: [],
      discovery: { integrity: { url: { sha256: '${url}.sha256' } } },
    };
    const { manifest } = await resolveDiscovery(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.integrity).toEqual({ sha256: hex });
  });
});
