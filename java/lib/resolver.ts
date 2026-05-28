/**
 * Resolver for OpenJDK builds from the Eclipse Adoptium (Temurin) distribution.
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
 * are soft-skipped — the resulting `JavaRelease` only contains the platforms
 * with a real binary.
 */
import { fetchWithRetry } from '@lanka/core';
import type { OsName, OsArch } from '@lanka/core';

const ADOPTIUM_BASE = 'https://api.adoptium.net/v3';
const VENDOR = 'eclipse';

/** Adoptium-side platform descriptor + how it maps onto lanka's OS/arch enums. */
export interface JavaPlatform {
  /** lanka OS name. */
  readonly os: OsName;
  /** lanka arch. `x86_64` is Adoptium's `x64`. */
  readonly arch: OsArch;
  /** Adoptium API `os` value (`linux`, `mac`, `windows`). */
  readonly adoptiumOs: 'linux' | 'mac' | 'windows';
  /** Adoptium API `architecture` value. */
  readonly adoptiumArch: 'x64' | 'aarch64';
  /**
   * Path appended to the extracted top-level directory to reach JAVA_HOME.
   * Empty on Linux/Windows; `/Contents/Home` on macOS bundles.
   */
  readonly homeSuffix: string;
}

export const DEFAULT_PLATFORMS: readonly JavaPlatform[] = [
  {
    os: 'linux',
    arch: 'x86_64',
    adoptiumOs: 'linux',
    adoptiumArch: 'x64',
    homeSuffix: '',
  },
  {
    os: 'linux',
    arch: 'aarch64',
    adoptiumOs: 'linux',
    adoptiumArch: 'aarch64',
    homeSuffix: '',
  },
  {
    os: 'osx',
    arch: 'x86_64',
    adoptiumOs: 'mac',
    adoptiumArch: 'x64',
    homeSuffix: '/Contents/Home',
  },
  {
    os: 'osx',
    arch: 'aarch64',
    adoptiumOs: 'mac',
    adoptiumArch: 'aarch64',
    homeSuffix: '/Contents/Home',
  },
  {
    os: 'windows',
    arch: 'x86_64',
    adoptiumOs: 'windows',
    adoptiumArch: 'x64',
    homeSuffix: '',
  },
  {
    os: 'windows',
    arch: 'aarch64',
    adoptiumOs: 'windows',
    adoptiumArch: 'aarch64',
    homeSuffix: '',
  },
];

/** A resolved binary for one (os, arch) platform. */
export interface JavaBinary {
  readonly platform: JavaPlatform;
  /** Asset filename, e.g. `OpenJDK21U-jdk_x64_linux_hotspot_21.0.11_10.tar.gz`. */
  readonly filename: string;
  /** Direct download URL (GitHub release asset). */
  readonly url: string;
  /** Asset size in bytes. */
  readonly size: number;
  /** sha256 of the asset (hex). */
  readonly sha256: string;
}

export interface JavaRelease {
  /** Adoptium release name, e.g. `jdk-21.0.11+10`. */
  readonly releaseName: string;
  /** Top-level directory after extraction (matches `releaseName`). */
  readonly extractDir: string;
  /** Major version, e.g. `21`. */
  readonly major: number;
  /** Per-platform binaries that exist for this release. */
  readonly binaries: JavaBinary[];
}

export interface ResolveOpenjdkOptions {
  /** Override the platform set. Default: linux/mac/windows × x64+aarch64. */
  platforms?: readonly JavaPlatform[];
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

function adoptiumQuery(platform: JavaPlatform): string {
  const params = new URLSearchParams({
    image_type: 'jdk',
    architecture: platform.adoptiumArch,
    os: platform.adoptiumOs,
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
  platform: JavaPlatform,
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
      `Adoptium API ${res.status} ${res.statusText} for ${platform.adoptiumOs}/${platform.adoptiumArch}`,
    );
  }
  const body = (await res.json()) as AdoptiumRelease | AdoptiumRelease[];
  const release = Array.isArray(body) ? body[0] : body;
  if (!release || !release.binaries || release.binaries.length === 0)
    return null;
  const binary = release.binaries.find(
    (b) =>
      b.architecture === platform.adoptiumArch &&
      b.os === platform.adoptiumOs &&
      b.image_type === 'jdk',
  );
  if (!binary) return null;
  return { release, binary };
}

/**
 * Resolve an OpenJDK release across all requested platforms. Returns a
 * single `JavaRelease` with one entry per platform that has a binary
 * available — platforms that don't ship a build for this release are
 * silently dropped from `binaries`, so callers don't have to handle the
 * "linux x64 exists, windows aarch64 doesn't" case explicitly.
 */
export async function resolveOpenjdk(
  version: string,
  options: ResolveOpenjdkOptions = {},
): Promise<JavaRelease> {
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
      `No OpenJDK binaries found for version '${version}' across requested platforms.`,
    );
  }

  // All platforms should agree on release_name when querying a specific
  // release_name; for major queries each platform may resolve to a
  // different latest GA — we anchor to the most-common release_name to
  // keep the bundle coherent (and skip mismatched binaries).
  const nameCounts = new Map<string, number>();
  for (const m of matched) {
    nameCounts.set(
      m.release.release_name,
      (nameCounts.get(m.release.release_name) ?? 0) + 1,
    );
  }
  // count desc, then newest/lexicographically-largest release name wins on a tie
  const releaseName = [...nameCounts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].localeCompare(a[0]),
  )[0]![0];

  const consistent = matched.filter(
    (m) => m.release.release_name === releaseName,
  );

  const binaries: JavaBinary[] = consistent.map((m) => ({
    platform: m.platform,
    filename: m.binary.package.name,
    url: m.binary.package.link,
    size: m.binary.package.size,
    sha256: m.binary.package.checksum,
  }));

  return {
    releaseName,
    extractDir: releaseName,
    major: consistent[0]!.release.version_data.major,
    binaries,
  };
}
