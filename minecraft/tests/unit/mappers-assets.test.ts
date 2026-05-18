import { describe, expect, it } from 'vitest';
import { mapAssetIndex, mapAssetObjects } from '../../lib/mappers/assets';
import type { AssetIndex, AssetManifest } from '@torba/mojang';

const index: AssetIndex = {
  id: '5',
  sha1: 'a'.repeat(40),
  size: 123,
  totalSize: 456,
  url: 'https://piston-meta/assets/5.json',
};

describe('mapAssetIndex', () => {
  it('maps an asset index into a url artifact under assets_root', () => {
    const art = mapAssetIndex(index);
    expect(art.path).toBe('${assets_root}/indexes/5.json');
    expect(art.source).toEqual({ kind: 'url', url: index.url });
    expect(art.size).toBe(123);
    expect(art.integrity).toEqual({ sha1: 'a'.repeat(40) });
    expect(art.rules).toEqual([]);
  });
});

describe('mapAssetObjects', () => {
  const manifest: AssetManifest = {
    objects: {
      'minecraft/sounds/foo.ogg': { hash: 'ab'.repeat(20), size: 10 },
      'minecraft/lang/en.json': { hash: 'cd'.repeat(20), size: 20 },
    },
  };

  it('maps every object into a url artifact with a hash-sharded path', () => {
    const arts = mapAssetObjects(manifest);
    expect(arts).toHaveLength(2);
    const first = arts[0]!;
    expect(first.path).toBe(`\${assets_root}/objects/ab/${'ab'.repeat(20)}`);
    expect(first.source).toEqual({
      kind: 'url',
      url: `https://resources.download.minecraft.net/ab/${'ab'.repeat(20)}`,
    });
    expect(first.size).toBe(10);
  });

  it('carries the logical asset name in metadata', () => {
    const arts = mapAssetObjects(manifest);
    expect(arts.map((a) => a.metadata)).toEqual([
      { name: 'minecraft/sounds/foo.ogg' },
      { name: 'minecraft/lang/en.json' },
    ]);
  });

  it('returns an empty list for an empty manifest', () => {
    expect(mapAssetObjects({ objects: {} })).toEqual([]);
  });
});
