/**
 * Vendor resolver for Eclipse Temurin (the Adoptium project's OpenJDK
 * builds).
 *
 * Adoptium publishes a public asset API at `https://api.adoptium.net/v3/`.
 * We use two endpoints depending on the version input shape:
 *
 *   - Major-only (`'21'`, `'17'`)  → `/feature_releases/<major>/ga` (latest GA)
 *   - Full version                 → `/release_name/<vendor>/<release-name>`
 *     (exact, pinned build). Adoptium release names differ by line — Java 8
 *     is `jdk8u<update>-b<build>` (no hyphen), Java 9+ is `jdk-<version>`.
 *     A full input is accepted bare (`'8u492-b09'`, `'21.0.13+11'`) or as a
 *     complete release name (`'jdk8u492-b09'`, `'jdk-21.0.13+11'`).
 *
 * Each platform (os × arch) is queried separately with `image_type=jdk` and
 * `jvm_impl=hotspot`. Releases that don't ship a binary for a given platform
 * are soft-skipped — the resulting release only contains the platforms with
 * a real binary.
 */
import { fetchWithRetry } from '@opys/core';
import type { OsName } from '@opys/core';
import {
  DEFAULT_PLATFORMS,
  type Platform,
  type SupportedArch,
} from './platforms';
import { pickAnchor, type VendorBinary, type VendorRelease } from './vendor';

const ADOPTIUM_BASE = 'https://api.adoptium.net/v3';
const VENDOR = 'eclipse';

const ADOPTIUM_OS: Record<OsName, 'linux' | 'mac' | 'windows'> = {
  linux: 'linux',
  osx: 'mac',
  windows: 'windows',
};
const ADOPTIUM_ARCH: Record<SupportedArch, 'x64' | 'aarch64'> = {
  x86_64: 'x64',
  aarch64: 'aarch64',
};

export interface ResolveTemurinOptions {
  /** Override the platform set. Default: linux/mac/windows × x64+aarch64. */
  platforms?: readonly Platform[];
  /** Optional override for the Adoptium API base URL. */
  apiBase?: string;
}

interface AdoptiumPackage {
  checksum: string;
  link: string;
  name: string;
  size: number;
}

interface AdoptiumBinary {
  architecture: string;
  os: string;
  image_type: string;
  jvm_impl: string;
  package: AdoptiumPackage;
}

interface AdoptiumRelease {
  release_name: string;
  binaries: AdoptiumBinary[];
  version_data: { major: number };
}

/** Normalized version input: a bare major, or a full Adoptium version. */
type VersionInput = { kind: 'major' | 'full'; raw: string };

function normalizeInput(input: string): VersionInput {
  const v = input.trim().replace(/-LTS$/, '');
  if (/^\d+$/.test(v)) return { kind: 'major', raw: v };
  // A `full` input resolves to an exact Adoptium release name. A value that
  // already carries the `jdk` prefix is a complete release name; a bare
  // version is prefixed to match — `jdk` (no hyphen) for the Java 8
  // `8u…-b…` form, `jdk-` for the Java 9+ `<major>.<minor>.<patch>+<build>`.
  if (v.startsWith('jdk')) return { kind: 'full', raw: v };
  return { kind: 'full', raw: /^\d+u/.test(v) ? `jdk${v}` : `jdk-${v}` };
}

function adoptiumQuery(platform: Platform): string {
  const params = new URLSearchParams({
    image_type: 'jdk',
    architecture: ADOPTIUM_ARCH[platform.arch],
    os: ADOPTIUM_OS[platform.os],
    jvm_impl: 'hotspot',
    // `heap_size=normal` excludes the `large` (huge-pages) variant;
    // `vendor=eclipse` pins the distribution to Temurin.
    heap_size: 'normal',
    vendor: VENDOR,
  });
  return params.toString();
}

async function fetchPlatform(
  apiBase: string,
  platform: Platform,
  version: VersionInput,
): Promise<{ release: AdoptiumRelease; binary: AdoptiumBinary } | null> {
  const path =
    version.kind === 'major'
      ? `/assets/feature_releases/${version.raw}/ga?${adoptiumQuery(platform)}&page_size=1&sort_order=DESC`
      : `/assets/release_name/${VENDOR}/${encodeURIComponent(version.raw)}?${adoptiumQuery(platform)}`;

  const url = `${apiBase}${path}`;
  const res = await fetchWithRetry(url, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `Adoptium API ${res.status} ${res.statusText} for ${ADOPTIUM_OS[platform.os]}/${ADOPTIUM_ARCH[platform.arch]}`,
    );
  }
  const body = (await res.json()) as AdoptiumRelease | AdoptiumRelease[];
  const release = Array.isArray(body) ? body[0] : body;
  if (!release || !release.binaries || release.binaries.length === 0)
    return null;
  const binary = release.binaries.find(
    (b) =>
      b.architecture === ADOPTIUM_ARCH[platform.arch] &&
      b.os === ADOPTIUM_OS[platform.os] &&
      b.image_type === 'jdk',
  );
  if (!binary) return null;
  return { release, binary };
}

/**
 * Resolve a Temurin release across all requested platforms, anchored so
 * every platform lands on the same release (per-platform queries can
 * independently resolve to a different latest-GA when a build hasn't
 * rolled out to every platform yet — mismatched platforms are dropped).
 */
export async function resolveTemurin(
  version: string,
  options: ResolveTemurinOptions = {},
): Promise<VendorRelease> {
  const apiBase = options.apiBase ?? ADOPTIUM_BASE;
  const platforms = options.platforms ?? DEFAULT_PLATFORMS;
  const parsed = normalizeInput(version);

  const fetched = await Promise.all(
    platforms.map(async (p) => {
      const found = await fetchPlatform(apiBase, p, parsed);
      return found ? { platform: p, ...found } : null;
    }),
  );

  const matched = fetched.filter((x): x is NonNullable<typeof x> => x !== null);
  if (matched.length === 0) {
    throw new Error(
      `No Temurin binaries found for version '${version}' across requested platforms.`,
    );
  }

  const releaseName = pickAnchor(matched, (m) => m.release.release_name);
  const consistent = matched.filter(
    (m) => m.release.release_name === releaseName,
  );

  const binaries: VendorBinary[] = consistent.map((m) => ({
    platform: m.platform,
    filename: m.binary.package.name,
    url: m.binary.package.link,
    size: m.binary.package.size,
    sha256: m.binary.package.checksum,
  }));

  return {
    label: `Temurin ${releaseName.replace(/^jdk-?/, '')}`,
    major: consistent[0]!.release.version_data.major,
    binaries,
  };
}
