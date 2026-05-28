import { z } from 'zod';
import { fetchWithRetry } from '@lanka/core';

export interface AssetObject {
  readonly hash: string;
  readonly size: number;
}

export interface AssetManifest {
  readonly objects: Record<string, AssetObject>;
}

export interface AssetIndex {
  readonly id: string;
  readonly sha1: string;
  readonly size: number;
  readonly totalSize: number;
  readonly url: string;
}

const AssetObjectSchema = z.object({ hash: z.string(), size: z.number() });

export const AssetManifestSchema = z.object({
  objects: z.record(z.string(), AssetObjectSchema),
});

export const AssetIndexSchema = z.object({
  id: z.string(),
  sha1: z.string(),
  size: z.number(),
  totalSize: z.number(),
  url: z.string(),
});

/** URL for an asset object given its hash. */
export const assetUrl = (hash: string): string =>
  `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`;

/** Relative path for an asset object within the objects directory. */
export const assetPath = (hash: string): string =>
  `${hash.slice(0, 2)}/${hash}`;

/** Fetch and parse the asset manifest from the given URL. Throws on HTTP error. */
export async function fetchAssetManifest(url: string): Promise<AssetManifest> {
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch asset manifest ${url}: ${res.statusText}`);
  }
  return AssetManifestSchema.parse(await res.json());
}
