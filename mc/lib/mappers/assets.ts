import type { Unifact } from '@unifest/core';
import { sourceUrl, exactSize, skipIntegrity } from '@unifest/core';
import type { AssetManifest, AssetIndex } from '@unifest/minecraft';
import { assetUrl, assetPath } from '@unifest/minecraft';

export function mapAssetIndex(
  index: AssetIndex,
  assetsRootVar = '${assets_root}',
): Unifact {
  return {
    path: `${assetsRootVar}/indexes/${index.id}.json`,
    source: sourceUrl(index.url),
    size: exactSize(index.size),
    rules: [],
    integrity: { kind: 'hashes', entries: [{ sha1: index.sha1 }] },
  };
}

export function mapAssetObjects(
  manifest: AssetManifest,
  assetsRootVar = '${assets_root}',
): Unifact[] {
  return Object.entries(manifest.objects).map(([name, obj]) => ({
    path: `${assetsRootVar}/objects/${assetPath(obj.hash)}`,
    source: sourceUrl(assetUrl(obj.hash)),
    size: exactSize(obj.size),
    rules: [],
    integrity: skipIntegrity(),
    metadata: { name },
  }));
}
