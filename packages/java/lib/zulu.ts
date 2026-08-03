/**
 * Vendor resolver for Azul Zulu builds of OpenJDK.
 *
 * Azul publishes a public metadata API at `https://api.azul.com/metadata/v1/`.
 * Each platform (os × arch) is queried separately against `/zulu/packages/`
 * with a fixed filter set (see `zuluQuery`) — glibc (not musl) on Linux,
 * non-CRaC, no bundled JavaFX, GA/CA only — requesting `sha256_hash`/`size`
 * inline via `include_fields` so no second per-binary request is needed.
 *
 * Results are sorted client-side by `java_version` rather than trusted to
 * come back pre-sorted; a major-only input additionally anchors every
 * platform on the version most of them agree on (see `pickAnchor`), same
 * as Temurin — per-platform queries can independently resolve to a
 * different latest patch when a build hasn't rolled out everywhere yet.
 */
import { fetchWithRetry } from '@opys/core';
import type { OsName } from '@opys/core';
import {
  DEFAULT_PLATFORMS,
  type Platform,
  type SupportedArch,
} from './platforms';
import { pickAnchor, type VendorBinary, type VendorRelease } from './vendor';

const ZULU_BASE = 'https://api.azul.com/metadata/v1';

// `linux-glibc` (not the bare `linux`, which mixes in musl builds) — musl
// targets Alpine-style distros and isn't in scope for this resolver.
const ZULU_OS: Record<OsName, 'linux-glibc' | 'macos' | 'windows'> = {
  linux: 'linux-glibc',
  osx: 'macos',
  windows: 'windows',
};
const ZULU_ARCH: Record<SupportedArch, 'x64' | 'aarch64'> = {
  x86_64: 'x64',
  aarch64: 'aarch64',
};

function archiveType(os: OsName): 'tar.gz' | 'zip' {
  return os === 'windows' ? 'zip' : 'tar.gz';
}

export interface ResolveZuluOptions {
  /** Override the platform set. Default: linux/mac/windows × x64+aarch64. */
  platforms?: readonly Platform[];
  /** Optional override for the Azul Metadata API base URL. */
  apiBase?: string;
}

interface ZuluPackage {
  name: string;
  download_url: string;
  size: number;
  sha256_hash: string;
  java_version: number[];
  distro_version: number[];
}

type VersionInput = { kind: 'major' | 'full'; raw: string };

function normalizeInput(input: string): VersionInput {
  const v = input.trim();
  return { kind: /^\d+$/.test(v) ? 'major' : 'full', raw: v };
}

function zuluQuery(platform: Platform, version: VersionInput): URLSearchParams {
  const params = new URLSearchParams({
    java_version: version.raw,
    os: ZULU_OS[platform.os],
    arch: ZULU_ARCH[platform.arch],
    archive_type: archiveType(platform.os),
    java_package_type: 'jdk',
    javafx_bundled: 'false',
    crac_supported: 'false',
    release_status: 'ga',
    page_size: '10',
  });
  params.append('availability_types', 'CA');
  params.append('include_fields', 'sha256_hash');
  params.append('include_fields', 'size');
  return params;
}

/** Descending compare on a `[major, minor, patch, …]` version tuple. */
function compareVersionsDesc(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchPlatform(
  apiBase: string,
  platform: Platform,
  version: VersionInput,
): Promise<ZuluPackage[]> {
  const url = `${apiBase}/zulu/packages/?${zuluQuery(platform, version).toString()}`;
  const res = await fetchWithRetry(url, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(
      `Azul API ${res.status} ${res.statusText} for ${ZULU_OS[platform.os]}/${ZULU_ARCH[platform.arch]}`,
    );
  }
  const body = (await res.json()) as ZuluPackage[];
  const packages = Array.isArray(body) ? body : [];
  return [...packages].sort((a, b) =>
    compareVersionsDesc(a.java_version, b.java_version),
  );
}

/**
 * Resolve a Zulu release across all requested platforms, anchored so every
 * platform lands on the same `java_version`.
 */
export async function resolveZulu(
  version: string,
  options: ResolveZuluOptions = {},
): Promise<VendorRelease> {
  const apiBase = options.apiBase ?? ZULU_BASE;
  const platforms = options.platforms ?? DEFAULT_PLATFORMS;
  const parsed = normalizeInput(version);

  const perPlatform = await Promise.all(
    platforms.map(async (platform) => ({
      platform,
      packages: await fetchPlatform(apiBase, platform, parsed),
    })),
  );

  const withResults = perPlatform.filter((p) => p.packages.length > 0);
  if (withResults.length === 0) {
    throw new Error(
      `No Zulu binaries found for version '${version}' across requested platforms.`,
    );
  }

  const anchorVersion = pickAnchor(withResults, (p) =>
    p.packages[0]!.java_version.join('.'),
  );

  const matched = withResults
    .map((p) => ({
      platform: p.platform,
      pkg: p.packages.find(
        (pkg) => pkg.java_version.join('.') === anchorVersion,
      ),
    }))
    .filter(
      (m): m is { platform: Platform; pkg: ZuluPackage } => m.pkg !== undefined,
    );

  const binaries: VendorBinary[] = matched.map((m) => ({
    platform: m.platform,
    filename: m.pkg.name,
    url: m.pkg.download_url,
    size: m.pkg.size,
    sha256: m.pkg.sha256_hash,
  }));

  return {
    label: `Zulu ${matched[0]!.pkg.distro_version.join('.')} (JDK ${anchorVersion})`,
    major: matched[0]!.pkg.java_version[0]!,
    binaries,
  };
}
