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

import {
  gitHubAssetSha256,
  pickGitHubRelease,
  type GitHubAsset,
} from '@opys/dev';

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

function isInstallerAsset(asset: GitHubAsset): boolean {
  return (
    /-installer\.jar$/.test(asset.name) && !asset.name.includes('-sources')
  );
}

export async function resolveCleanroomVersion(
  input: string,
  options: ResolveCleanroomOptions = {},
): Promise<CleanroomRelease> {
  const repo = options.repo ?? DEFAULT_REPO;
  const release = await pickGitHubRelease(repo, input, {
    token: options.token,
    filter: (r) => r.assets.some(isInstallerAsset),
  });
  // Filter guaranteed at least one installer asset exists.
  const installer = release.assets.find(isInstallerAsset)!;
  return {
    tag: release.tag_name,
    prerelease: release.prerelease,
    installerUrl: installer.browser_download_url,
    installerName: installer.name,
    installerSize: installer.size,
    installerSha256: gitHubAssetSha256(installer),
    publishedAt: release.published_at,
  };
}
