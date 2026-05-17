import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sourceFile,
  sourcePointer,
  type Artifact,
  type Manifest,
} from '@torba/core';
import { resolvePointers } from '../../lib/phases/resolve-pointers';
import { currentPlatform } from '../../lib/platform';

const PLATFORM = currentPlatform();

function sha1(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

function manifestOf(artifacts: Artifact[]): Manifest {
  return { vars: {}, artifacts };
}

/** Stub global fetch with a url → descriptor-JSON lookup table. */
function stubDescriptors(table: Record<string, unknown>): void {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.href;
    const body = table[url];
    if (body === undefined) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'unipack-pointer-test-'));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(tmpDir, { recursive: true, force: true });
});

describe('resolvePointers', () => {
  it('leaves non-pointer artifacts untouched', async () => {
    const artifact: Artifact = {
      path: join(tmpDir, 'a.txt'),
      source: sourceFile('/src/a.txt'),
      rules: [],
    };
    const { manifest, refetch, resolved } = await resolvePointers(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(resolved).toBe(0);
    expect(manifest.artifacts[0]).toEqual(artifact);
    expect(refetch.size).toBe(0);
  });

  it('resolves a pointer to its concrete source, integrity and size', async () => {
    stubDescriptors({
      'https://example.com/latest.json': {
        source: { url: 'https://cdn/lang-2.4.1.zip' },
        integrity: { sha256: 'abc' },
        size: 999,
      },
    });
    const artifact: Artifact = {
      path: join(tmpDir, 'lang.zip'),
      source: sourcePointer('https://example.com/latest.json'),
      rules: [],
    };
    const { manifest, resolved } = await resolvePointers(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(resolved).toBe(1);
    const out = manifest.artifacts[0]!;
    expect(out.source).toEqual({
      kind: 'url',
      url: 'https://cdn/lang-2.4.1.zip',
    });
    expect(out.integrity).toEqual({ sha256: 'abc' });
    expect(out.size).toBe(999);
  });

  it('interpolates vars in the pointer URL', async () => {
    stubDescriptors({
      'https://example.com/en/latest.json': {
        source: { url: 'https://cdn/en.zip' },
      },
    });
    const artifact: Artifact = {
      path: join(tmpDir, 'lang.zip'),
      source: sourcePointer('https://example.com/${lang}/latest.json'),
      rules: [],
    };
    const { manifest } = await resolvePointers(
      manifestOf([artifact]),
      { lang: 'en' },
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.source).toEqual({
      kind: 'url',
      url: 'https://cdn/en.zip',
    });
  });

  it('follows a descriptor that points at another pointer', async () => {
    stubDescriptors({
      'https://example.com/channel.json': {
        source: { pointer: 'https://example.com/build.json' },
      },
      'https://example.com/build.json': {
        source: { url: 'https://cdn/final.zip' },
        integrity: { sha1: 'beef' },
      },
    });
    const artifact: Artifact = {
      path: join(tmpDir, 'lang.zip'),
      source: sourcePointer('https://example.com/channel.json'),
      rules: [],
    };
    const { manifest } = await resolvePointers(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(manifest.artifacts[0]!.source).toEqual({
      kind: 'url',
      url: 'https://cdn/final.zip',
    });
    expect(manifest.artifacts[0]!.integrity).toEqual({ sha1: 'beef' });
  });

  it('throws when a pointer chain loops too deep', async () => {
    stubDescriptors({
      'https://example.com/loop.json': {
        source: { pointer: 'https://example.com/loop.json' },
      },
    });
    const artifact: Artifact = {
      path: join(tmpDir, 'lang.zip'),
      source: sourcePointer('https://example.com/loop.json'),
      rules: [],
    };
    await expect(
      resolvePointers(manifestOf([artifact]), {}, PLATFORM),
    ).rejects.toThrow(/exceeded/);
  });

  it('throws a NetworkError when the descriptor is unreachable', async () => {
    stubDescriptors({});
    const artifact: Artifact = {
      path: join(tmpDir, 'lang.zip'),
      source: sourcePointer('https://example.com/missing.json'),
      rules: [],
    };
    await expect(
      resolvePointers(manifestOf([artifact]), {}, PLATFORM),
    ).rejects.toThrow(/HTTP 404/);
  });

  describe('freshness', () => {
    it('flags a stale local copy for refetch', async () => {
      const dest = join(tmpDir, 'lang.zip');
      await writeFile(dest, 'old content');
      stubDescriptors({
        'https://example.com/latest.json': {
          source: { url: 'https://cdn/new.zip' },
          integrity: { sha1: sha1('new content') },
        },
      });
      const artifact: Artifact = {
        path: dest,
        source: sourcePointer('https://example.com/latest.json'),
        rules: [],
      };
      const { refetch } = await resolvePointers(
        manifestOf([artifact]),
        {},
        PLATFORM,
      );
      expect(refetch.has(dest)).toBe(true);
    });

    it('keeps a local copy whose hash still matches the descriptor', async () => {
      const dest = join(tmpDir, 'lang.zip');
      await writeFile(dest, 'current content');
      stubDescriptors({
        'https://example.com/latest.json': {
          source: { url: 'https://cdn/cur.zip' },
          integrity: { sha1: sha1('current content') },
        },
      });
      const artifact: Artifact = {
        path: dest,
        source: sourcePointer('https://example.com/latest.json'),
        rules: [],
      };
      const { refetch } = await resolvePointers(
        manifestOf([artifact]),
        {},
        PLATFORM,
      );
      expect(refetch.has(dest)).toBe(false);
    });

    it('always refetches an existing copy when the descriptor has no hash', async () => {
      const dest = join(tmpDir, 'lang.zip');
      await writeFile(dest, 'whatever');
      stubDescriptors({
        'https://example.com/latest.json': {
          source: { url: 'https://cdn/cur.zip' },
        },
      });
      const artifact: Artifact = {
        path: dest,
        source: sourcePointer('https://example.com/latest.json'),
        rules: [],
      };
      const { refetch } = await resolvePointers(
        manifestOf([artifact]),
        {},
        PLATFORM,
      );
      expect(refetch.has(dest)).toBe(true);
    });
  });

  it('skips resolution for an artifact excluded by platform rules', async () => {
    const otherOs = PLATFORM.name === 'windows' ? 'linux' : 'windows';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const artifact: Artifact = {
      path: join(tmpDir, 'lang.zip'),
      source: sourcePointer('https://example.com/latest.json'),
      rules: [{ action: 'allow', os: { name: otherOs } }],
    };
    const { manifest, resolved } = await resolvePointers(
      manifestOf([artifact]),
      {},
      PLATFORM,
    );
    expect(resolved).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    // pointer source survives untouched — scan drops it afterwards
    expect(manifest.artifacts[0]!.source).toEqual(artifact.source);
  });
});
