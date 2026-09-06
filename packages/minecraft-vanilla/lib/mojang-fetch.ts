/**
 * HTTP for the Mojang endpoints.
 *
 * `@opys/mojang` is a pure parser and performs no I/O, so fetching lives with
 * the caller. This is the only caller — and it already owned the client-JSON
 * fetch — so the retry policy stays in one place, on `@opys/core`'s
 * `fetchWithRetry`. A DNS hiccup mid-`opys build` must not abort the run.
 */
import { fetchWithRetry } from '@opys/core';
import {
  parseAssetManifest,
  parseVersionManifest,
  VERSION_MANIFEST_URL,
  type AssetManifest,
  type VersionManifest,
} from '@opys/mojang';

export { VERSION_MANIFEST_URL };

export class VersionFetchError extends Error {
  readonly kind = 'version-fetch' as const;
  constructor(
    readonly url: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'VersionFetchError';
  }
}

export async function fetchVersionManifest(
  url = VERSION_MANIFEST_URL,
): Promise<VersionManifest> {
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new VersionFetchError(
      url,
      response.status,
      `Failed to fetch version manifest: HTTP ${response.status} ${response.statusText}`,
    );
  }
  return parseVersionManifest(await response.json());
}

/** Fetch and parse the asset manifest. Throws on HTTP error. */
export async function fetchAssetManifest(url: string): Promise<AssetManifest> {
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch asset manifest ${url}: ${res.statusText}`);
  }
  return parseAssetManifest(await res.json());
}
