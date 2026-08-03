/**
 * Vendor resolver for GraalVM Community Edition, built from the
 * `graalvm/graalvm-ce-builds` GitHub releases (the Apache-2.0 community
 * builds — distinct from Oracle GraalVM's own no-fee distribution, which
 * this resolver does not target).
 *
 * Releases are tagged `jdk-<version>` for the standard GA cadence. A
 * major-only input picks the newest `jdk-<major>.*` tag; a full input
 * matches a tag exactly (verbatim if already tag-shaped, e.g. an explicit
 * `graal-25.2.4` "Innovation" tag — the newer, non-LTS cadence this
 * resolver otherwise doesn't recognize, since its version numbering
 * doesn't reliably embed the JDK major and it isn't needed to support
 * "give me the latest GraalVM for JDK `<major>`").
 *
 * The archive's internal top-level directory embeds a build identifier
 * that isn't derivable from release metadata (verified by inspecting real
 * archives: tag `jdk-21.0.2` extracts to
 * `graalvm-community-openjdk-21.0.2+13.1/`) — `template.ts` sidesteps this
 * entirely by extracting with a glob-strip rule that drops the archive's
 * leading path segment regardless of its name, so this resolver never
 * needs to know it.
 *
 * Checksums: GitHub computes an inline `digest` for assets uploaded since
 * 2024; older releases lack it. Every GraalVM CE archive ships a sibling
 * `<archive>.sha256` asset (just the bare hex hash, verified against a real
 * release), so binaries without an inline digest fall back to install-time
 * `discovery` against that sibling file instead of shipping unverified.
 */
import {
  gitHubAssetSha256,
  pickGitHubRelease,
  type GitHubAsset,
} from '@opys/dev';
import type { OsName } from '@opys/core';
import {
  DEFAULT_PLATFORMS,
  type Platform,
  type SupportedArch,
} from './platforms';
import type { VendorBinary, VendorRelease } from './vendor';

const REPO = 'graalvm/graalvm-ce-builds';

const GRAALVM_OS: Record<OsName, 'linux' | 'macos' | 'windows'> = {
  linux: 'linux',
  osx: 'macos',
  windows: 'windows',
};
const GRAALVM_ARCH: Record<SupportedArch, 'x64' | 'aarch64'> = {
  x86_64: 'x64',
  aarch64: 'aarch64',
};

function archiveExt(os: OsName): 'tar.gz' | 'zip' {
  return os === 'windows' ? 'zip' : 'tar.gz';
}

export interface ResolveGraalvmOptions {
  /** Override the platform set. Default: linux/mac/windows × x64+aarch64. */
  platforms?: readonly Platform[];
  /** Optional GitHub token for higher rate limits. */
  token?: string;
}

type VersionInput =
  { kind: 'major'; major: string } | { kind: 'full'; tag: string };

function normalizeInput(input: string): VersionInput {
  const v = input.trim();
  if (/^\d+$/.test(v)) return { kind: 'major', major: v };
  // A bare dotted version (`21.0.2`) names the standard `jdk-` cadence;
  // anything already tag-shaped (`jdk-21.0.2`, or an explicit
  // `graal-25.2.4` Innovation tag) is used verbatim.
  const tag = /^\d/.test(v) ? `jdk-${v}` : v;
  return { kind: 'full', tag };
}

function findAsset(
  assets: readonly GitHubAsset[],
  platform: Platform,
): GitHubAsset | undefined {
  const suffix = `_${GRAALVM_OS[platform.os]}-${GRAALVM_ARCH[platform.arch]}_bin.${archiveExt(platform.os)}`;
  return assets.find((a) => a.name.endsWith(suffix));
}

function parseMajor(tag: string): number {
  const m = /^jdk-(\d+)\./.exec(tag);
  if (!m) {
    throw new Error(
      `@opys/java: GraalVM release '${tag}' doesn't use the standard 'jdk-<major>.…' tag — only that release cadence is supported.`,
    );
  }
  return Number(m[1]);
}

/**
 * Resolve a GraalVM CE release across all requested platforms. Every
 * platform's asset comes from the same GitHub release (one tag = one
 * release for every platform at once), so unlike Temurin/Zulu there's no
 * per-platform version skew to anchor against.
 */
export async function resolveGraalvm(
  version: string,
  options: ResolveGraalvmOptions = {},
): Promise<VendorRelease> {
  const platforms = options.platforms ?? DEFAULT_PLATFORMS;
  const parsed = normalizeInput(version);

  const release = await pickGitHubRelease(
    REPO,
    parsed.kind === 'full' ? parsed.tag : 'latest',
    {
      token: options.token,
      ...(parsed.kind === 'major'
        ? {
            filter: (r) =>
              new RegExp(`^jdk-${parsed.major}\\.`).test(r.tag_name),
          }
        : {}),
    },
  );

  const binaries: VendorBinary[] = [];
  for (const platform of platforms) {
    const asset = findAsset(release.assets, platform);
    if (!asset) continue;
    const sha256 = gitHubAssetSha256(asset);
    binaries.push({
      platform,
      filename: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
      ...(sha256
        ? { sha256 }
        : { discovery: { integrity: { url: { sha256: '${url}.sha256' } } } }),
    });
  }
  if (binaries.length === 0) {
    throw new Error(
      `No GraalVM CE binaries found for version '${version}' across requested platforms.`,
    );
  }

  return {
    label: `GraalVM CE ${release.tag_name.replace(/^jdk-/, '')}`,
    major: parseMajor(release.tag_name),
    binaries,
  };
}
