/**
 * Shared GitHub Releases helpers.
 *
 * The forge-family loaders (cleanroom, lwjgl3ify, unimixins) all resolve
 * their versions straight off GitHub Releases. This module centralises the
 * release-listing request and the `sha256:<hex>` digest parsing so the
 * resolvers don't each carry their own copy.
 */

import { fetchWithRetry } from '@opys/core';

/** A single asset on a GitHub release, mirroring the `/releases` API shape. */
export interface GitHubAsset {
  name: string;
  size: number;
  browser_download_url: string;
  /** `sha256:<hex>` when present (introduced 2024); older releases lack it. */
  digest?: string;
}

/** A single GitHub release entry from the `/releases` API. */
export interface GitHubRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  published_at: string;
  assets: GitHubAsset[];
}

/**
 * List all releases for `repo` (`owner/name`), newest first. Fetches a
 * single page of up to 100 releases. `token` raises the rate limit.
 */
export async function listGitHubReleases(
  repo: string,
  token?: string,
): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchWithRetry(
    `https://api.github.com/repos/${repo}/releases?per_page=100`,
    { headers },
  );
  if (!res.ok) {
    throw new Error(
      `GitHub API ${res.status} ${res.statusText} listing ${repo} releases`,
    );
  }
  return (await res.json()) as GitHubRelease[];
}

/**
 * Extract the hex sha256 from an asset's `digest` field. GitHub's `digest`
 * is `sha256:<hex>` when present (introduced 2024); older releases lack it.
 */
export function gitHubAssetSha256(asset: GitHubAsset): string | undefined {
  return asset.digest?.startsWith('sha256:')
    ? asset.digest.slice('sha256:'.length)
    : undefined;
}
