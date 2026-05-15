/**
 * Resolver for Cleanroom releases on GitHub.
 *
 * Cleanroom has no fuckforge-equivalent metadata service — releases live
 * directly on GitHub Releases, and each release ships a self-describing
 * installer JAR (with `install_profile.json` + `version.json` inside).
 *
 * Accepted version forms:
 *   - Exact tag:  '0.5.9-alpha'
 *   - 'latest'      → newest non-prerelease (none exist as of writing)
 *   - 'prerelease'  → newest including prereleases
 */

import { fetchWithRetry } from '@torba/core';

const DEFAULT_REPO = 'CleanroomMC/Cleanroom';

export interface CleanroomRelease {
  /** Release tag, e.g. `0.5.9-alpha`. */
  readonly tag: string;
  /** Whether the release is marked as prerelease on GitHub. */
  readonly prerelease: boolean;
  /** Direct download URL for the installer JAR. */
  readonly installerUrl: string;
  /** Installer asset filename, e.g. `cleanroom-0.5.9-alpha-installer.jar`. */
  readonly installerName: string;
  /** Installer asset size in bytes. */
  readonly installerSize: number;
  /** sha256 of the installer asset, when GitHub publishes it. Hex only. */
  readonly installerSha256?: string;
  /** ISO timestamp the release was published. */
  readonly publishedAt: string;
}

export interface ResolveCleanroomOptions {
  /** GitHub repo `owner/name`. Default: `CleanroomMC/Cleanroom`. */
  repo?: string;
  /** Optional GitHub token for higher rate limits. */
  token?: string;
}

interface RawRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  published_at: string;
  assets: Array<{
    name: string;
    size: number;
    browser_download_url: string;
    digest?: string;
  }>;
}

async function fetchReleases(
  repo: string,
  token: string | undefined,
): Promise<RawRelease[]> {
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
  return (await res.json()) as RawRelease[];
}

function findInstaller(release: RawRelease): {
  url: string;
  name: string;
  size: number;
  sha256?: string;
} | null {
  const asset = release.assets.find(
    (a) => /-installer\.jar$/.test(a.name) && !a.name.includes('-sources'),
  );
  if (!asset) return null;
  // GitHub's `digest` field is `sha256:<hex>` when present (introduced
  // 2024). Older releases may not have it.
  const sha256 = asset.digest?.startsWith('sha256:')
    ? asset.digest.slice('sha256:'.length)
    : undefined;
  return {
    url: asset.browser_download_url,
    name: asset.name,
    size: asset.size,
    sha256,
  };
}

function toRelease(release: RawRelease): CleanroomRelease | null {
  const installer = findInstaller(release);
  if (!installer) return null;
  return {
    tag: release.tag_name,
    prerelease: release.prerelease,
    installerUrl: installer.url,
    installerName: installer.name,
    installerSize: installer.size,
    installerSha256: installer.sha256,
    publishedAt: release.published_at,
  };
}

export async function resolveCleanroomVersion(
  input: string,
  options: ResolveCleanroomOptions = {},
): Promise<CleanroomRelease> {
  const repo = options.repo ?? DEFAULT_REPO;
  const releases = (await fetchReleases(repo, options.token))
    .filter((r) => !r.draft)
    .map(toRelease)
    .filter((r): r is CleanroomRelease => r !== null);

  if (input === 'latest') {
    const stable = releases.find((r) => !r.prerelease);
    if (!stable) {
      throw new Error(
        `No stable Cleanroom release found in ${repo}. Try 'prerelease' or pin a specific tag.`,
      );
    }
    return stable;
  }
  if (input === 'prerelease') {
    if (releases.length === 0) {
      throw new Error(`No Cleanroom releases found in ${repo}`);
    }
    return releases[0]!;
  }

  const match = releases.find((r) => r.tag === input);
  if (!match) {
    throw new Error(
      `Cleanroom release '${input}' not found in ${repo}. Available: ${releases
        .slice(0, 5)
        .map((r) => r.tag)
        .join(', ')}${releases.length > 5 ? ', …' : ''}`,
    );
  }
  return match;
}
