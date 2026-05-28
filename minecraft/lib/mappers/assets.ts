import type { Artifact } from '@opys/core';
import { sourceUrl } from '@opys/core';
import type { AssetManifest, AssetIndex } from '@opys/mojang';
import { assetUrl, assetPath } from '@opys/mojang';

export function mapAssetIndex(index: AssetIndex): Artifact {
  return {
    path: `\${assets_root}/indexes/${index.id}.json`,
    source: sourceUrl(index.url),
    size: index.size,
    rules: [],
    integrity: { sha1: index.sha1 },
  };
}

export function mapAssetObjects(manifest: AssetManifest): Artifact[] {
  return Object.entries(manifest.objects).map(([name, obj]) => ({
    path: `\${assets_root}/objects/${assetPath(obj.hash)}`,
    source: sourceUrl(assetUrl(obj.hash)),
    size: obj.size,
    rules: [],
    metadata: { name },
  }));
}
