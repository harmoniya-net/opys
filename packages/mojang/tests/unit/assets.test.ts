import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assetUrl,
  assetPath,
  fetchAssetManifest,
  AssetManifestSchema,
  AssetIndexSchema,
} from '../../lib/client/assets';

afterEach(() => vi.unstubAllGlobals());

const HASH = 'abcdef0123456789abcdef0123456789abcdef01';

describe('assetUrl', () => {
  it('builds a resources URL sharded by the first two hex chars', () => {
    expect(assetUrl(HASH)).toBe(
      `https://resources.download.minecraft.net/ab/${HASH}`,
    );
  });
});

describe('assetPath', () => {
  it('builds a sharded relative path', () => {
    expect(assetPath(HASH)).toBe(`ab/${HASH}`);
  });
});

describe('AssetManifestSchema', () => {
  it('parses an objects map', () => {
    const parsed = AssetManifestSchema.parse({
      objects: { 'minecraft/sounds/x.ogg': { hash: HASH, size: 42 } },
    });
    expect(parsed.objects['minecraft/sounds/x.ogg']!.size).toBe(42);
  });

  it('rejects an object missing its size', () => {
    expect(() =>
      AssetManifestSchema.parse({ objects: { a: { hash: HASH } } }),
    ).toThrow();
  });
});

describe('AssetIndexSchema', () => {
  it('parses a full asset index entry', () => {
    const idx = AssetIndexSchema.parse({
      id: '5',
      sha1: HASH,
      size: 100,
      totalSize: 2000,
      url: 'https://meta/5.json',
    });
    expect(idx.id).toBe('5');
    expect(idx.totalSize).toBe(2000);
  });
});

describe('fetchAssetManifest', () => {
  it('fetches and parses the asset manifest', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ objects: { a: { hash: HASH, size: 1 } } }),
          ),
        ),
    );
    const m = await fetchAssetManifest('https://meta/assets.json');
    expect(m.objects.a!.hash).toBe(HASH);
  });

  it('throws on an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('no', { status: 404 })),
    );
    await expect(fetchAssetManifest('https://x')).rejects.toThrow(
      /Failed to fetch asset manifest/,
    );
  });
});
