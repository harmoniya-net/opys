/**
 * Shared GitHub Releases helpers.
 *
 * The forge-family loaders (cleanroom, lwjgl3ify, unimixins) all resolve
 * their versions straight off GitHub Releases. This module centralises the
 * release-listing request and the `sha256:<hex>` digest parsing so the
 * resolvers don't each carry their own copy.
 */

import {
  fetchWithRetry,
  sourceUrl,
  type Artifact,
  type Discovery,
  type ExtractRule,
  type Ruleset,
} from '@opys/core';

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

/** Selector accepted by {@link pickGitHubRelease}. */
export type GitHubReleaseSelector =
  /** Newest non-prerelease. */
  | 'latest'
  /** Newest including prereleases. */
  | 'prerelease'
  /** Exact `tag_name` match. */
  | (string & {});

export interface PickGitHubReleaseOptions {
  /** Optional GitHub token for higher rate limits. */
  token?: string;
  /**
   * Restrict candidates before the selector runs. Returns true to keep.
   * Use this when the loader needs specific assets present (e.g. a
   * `version.json` next to a mod jar) — `'latest'` then falls through to
   * the newest release that actually qualifies.
   */
  filter?: (release: GitHubRelease) => boolean;
}

/**
 * Fetch `repo`'s releases and pick one matching `selector`. Drafts are
 * always skipped; the optional `filter` further narrows candidates before
 * the selector runs. Throws a descriptive error (with up to 5 available
 * tags) when nothing matches.
 */
export async function pickGitHubRelease(
  repo: string,
  selector: GitHubReleaseSelector,
  options: PickGitHubReleaseOptions = {},
): Promise<GitHubRelease> {
  const candidates = (await listGitHubReleases(repo, options.token))
    .filter((r) => !r.draft)
    .filter(options.filter ?? (() => true));

  const picked = selectGitHubRelease(candidates, selector);
  if (picked) return picked;

  if (selector === 'latest' || selector === 'prerelease') {
    throw new Error(
      `No ${selector === 'latest' ? 'stable' : ''} GitHub release in ${repo}${
        options.filter ? ' matching the loader filter' : ''
      }`.replace(/  +/g, ' '),
    );
  }
  const tags = candidates.slice(0, 5).map((r) => r.tag_name);
  throw new Error(
    `GitHub release '${selector}' not found in ${repo}. Available: ${tags.join(
      ', ',
    )}${candidates.length > 5 ? ', …' : ''}`,
  );
}

function selectGitHubRelease(
  releases: GitHubRelease[],
  selector: GitHubReleaseSelector,
): GitHubRelease | undefined {
  if (selector === 'latest') return releases.find((r) => !r.prerelease);
  if (selector === 'prerelease') return releases[0];
  return releases.find((r) => r.tag_name === selector);
}

/**
 * One asset → Artifact mapping inside a {@link gitHubReleaseArtifacts}
 * call. The asset's URL, size, and sha256 are auto-derived; the spec
 * supplies the install-time path plus any extra Artifact fields.
 */
export interface GitHubAssetSpec {
  /** Predicate to pick the asset on the resolved release. */
  match: (asset: GitHubAsset, release: GitHubRelease) => boolean;
  /**
   * Install-time destination path. Manifest template literals (`${var}`)
   * pass through unchanged. Use the function form when the path embeds a
   * build-time value like the release tag.
   */
  path: string | ((asset: GitHubAsset, release: GitHubRelease) => string);
  /** Human description used in the error if `match` finds nothing. */
  description?: string;
  /** Manifest rules (OS/arch constraints). Default `[]`. */
  rules?: Ruleset;
  /** Extract rules for jars / tarballs. */
  extract?: ExtractRule[];
  /** Optional install-time discovery hints. */
  discovery?: Discovery;
  /** Opaque metadata, forwarded into the manifest unchanged. */
  metadata?: unknown;
}

export interface GitHubReleaseArtifactsOptions {
  /** GitHub token (raises rate limits). */
  token?: string;
  /**
   * Restrict candidate releases before the selector runs. Use when the
   * loader requires multiple assets present in the same release so that
   * `'latest'` falls through to the newest one that fully qualifies.
   */
  filter?: (release: GitHubRelease) => boolean;
  /** One spec per asset → Artifact mapping, in output order. */
  assets: GitHubAssetSpec[];
}

export interface GitHubReleaseArtifactsResult {
  /** The picked release — handy for downstream metadata or side-fetches. */
  release: GitHubRelease;
  /** Mapped artifacts in input order, one per `assets` spec. */
  artifacts: Artifact[];
}

/**
 * Pick a GitHub release and project a list of asset specs into Artifacts
 * in one call. Throws if the release can't be picked or any spec has no
 * matching asset on the picked release.
 *
 * @example
 *   const { artifacts } = await gitHubReleaseArtifacts(
 *     'me/myloader', version, {
 *       assets: [{
 *         match: (a) => a.name.endsWith('.jar'),
 *         path: '${mods_directory}/myloader.jar',
 *       }],
 *     },
 *   );
 */
export async function gitHubReleaseArtifacts(
  repo: string,
  selector: GitHubReleaseSelector,
  options: GitHubReleaseArtifactsOptions,
): Promise<GitHubReleaseArtifactsResult> {
  const release = await pickGitHubRelease(repo, selector, {
    token: options.token,
    filter: options.filter,
  });
  const artifacts = options.assets.map((spec) =>
    gitHubAssetToArtifact(spec, release),
  );
  return { release, artifacts };
}

function gitHubAssetToArtifact(
  spec: GitHubAssetSpec,
  release: GitHubRelease,
): Artifact {
  const asset = release.assets.find((a) => spec.match(a, release));
  if (!asset) {
    const what = spec.description ? ` (${spec.description})` : '';
    throw new Error(
      `No matching asset${what} on GitHub release ${release.tag_name}. ` +
        `Assets: ${release.assets.map((a) => a.name).join(', ') || '(none)'}`,
    );
  }
  const path =
    typeof spec.path === 'function' ? spec.path(asset, release) : spec.path;
  const sha256 = gitHubAssetSha256(asset);
  return {
    path,
    source: sourceUrl(asset.browser_download_url),
    size: asset.size,
    rules: spec.rules ?? [],
    ...(sha256 ? { integrity: { sha256 } } : {}),
    ...(spec.extract ? { extract: spec.extract } : {}),
    ...(spec.discovery ? { discovery: spec.discovery } : {}),
    ...(spec.metadata !== undefined ? { metadata: spec.metadata } : {}),
  };
}
