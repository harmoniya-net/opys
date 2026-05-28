/**
 * Resolver for lwjgl3ify releases on GitHub.
 *
 * Each lwjgl3ify GitHub release ships a literal `version.json` asset
 * alongside the mod jars. That file is a self-contained Mojang-format
 * client manifest (its `inheritsFrom` is null — it carries the vanilla
 * 1.7.10 client URL, asset index, and full library list inline).
 *
 * Accepted version forms:
 *   - Exact tag:  '3.0.16'
 *   - 'latest'      → newest non-prerelease release
 *   - 'prerelease'  → newest including prereleases
 */

import {
  gitHubAssetSha256,
  listGitHubReleases,
  type GitHubAsset,
  type GitHubRelease,
} from '@opys/dev';

const DEFAULT_REPO = 'GTNewHorizons/lwjgl3ify';

export interface Lwjgl3ifyAsset {
  readonly name: string;
  readonly url: string;
  readonly size: number;
  readonly sha256?: string;
}

export interface Lwjgl3ifyRelease {
  /** Release tag, e.g. `3.0.16`. */
  readonly tag: string;
  /** Whether the release is marked as prerelease on GitHub. */
  readonly prerelease: boolean;
  /** The release's `version.json` asset. */
  readonly versionJson: Lwjgl3ifyAsset;
  /** The plain `lwjgl3ify-<v>.jar` mod asset. Required for RFB plugin discovery — it ships the Pack200 redirect transformer. */
  readonly modJar: Lwjgl3ifyAsset;
  /** ISO timestamp the release was published. */
  readonly publishedAt: string;
}

export interface ResolveLwjgl3ifyOptions {
  /** GitHub repo `owner/name`. Default: `GTNewHorizons/lwjgl3ify`. */
  repo?: string;
  /** Optional GitHub token for higher rate limits. */
  token?: string;
}

function toAsset(asset: GitHubAsset): Lwjgl3ifyAsset {
  return {
    name: asset.name,
    url: asset.browser_download_url,
    size: asset.size,
    sha256: gitHubAssetSha256(asset),
  };
}

/**
 * Pick the plain `lwjgl3ify-<version>.jar` mod asset (no `-dev`,
 * `-sources`, `-api`, `-forgePatches`, etc. suffix). This is the jar that
 * carries the lwjgl3ify RFB plugin (`Pack200` redirect transformer).
 */
function findModJar(release: GitHubRelease, tag: string): GitHubAsset | null {
  const expected = `lwjgl3ify-${tag}.jar`;
  return release.assets.find((a) => a.name === expected) ?? null;
}

function toRelease(release: GitHubRelease): Lwjgl3ifyRelease | null {
  const versionJson = release.assets.find((a) => a.name === 'version.json');
  if (!versionJson) return null;
  const modJar = findModJar(release, release.tag_name);
  if (!modJar) return null;
  return {
    tag: release.tag_name,
    prerelease: release.prerelease,
    versionJson: toAsset(versionJson),
    modJar: toAsset(modJar),
    publishedAt: release.published_at,
  };
}

export async function resolveLwjgl3ifyVersion(
  input: string,
  options: ResolveLwjgl3ifyOptions = {},
): Promise<Lwjgl3ifyRelease> {
  const repo = options.repo ?? DEFAULT_REPO;
  const releases = (await listGitHubReleases(repo, options.token))
    .filter((r) => !r.draft)
    .map(toRelease)
    .filter((r): r is Lwjgl3ifyRelease => r !== null);

  if (input === 'latest') {
    const stable = releases.find((r) => !r.prerelease);
    if (!stable) {
      throw new Error(
        `No stable lwjgl3ify release with a version.json asset found in ${repo}`,
      );
    }
    return stable;
  }
  if (input === 'prerelease') {
    if (releases.length === 0) {
      throw new Error(
        `No lwjgl3ify release with a version.json asset found in ${repo}`,
      );
    }
    return releases[0]!;
  }

  const match = releases.find((r) => r.tag === input);
  if (!match) {
    throw new Error(
      `lwjgl3ify release '${input}' not found in ${repo}. Available: ${releases
        .slice(0, 5)
        .map((r) => r.tag)
        .join(', ')}${releases.length > 5 ? ', …' : ''}`,
    );
  }
  return match;
}
