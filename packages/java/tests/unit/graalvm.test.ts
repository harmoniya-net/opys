import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveGraalvm } from '../../lib/graalvm';
import type { Platform } from '../../lib/platforms';

afterEach(() => vi.unstubAllGlobals());

const LINUX_X64: Platform = { os: 'linux', arch: 'x86_64' };
const MAC_X64: Platform = { os: 'osx', arch: 'x86_64' };
const WIN_AARCH64: Platform = { os: 'windows', arch: 'aarch64' };

const PLATFORM_SUFFIXES: [string, string, string][] = [
  ['linux', 'x64', 'tar.gz'],
  ['linux', 'aarch64', 'tar.gz'],
  ['macos', 'x64', 'tar.gz'],
  ['macos', 'aarch64', 'tar.gz'],
  ['windows', 'x64', 'zip'],
];

function assetsFor(
  tag: string,
  opts: { digest?: boolean; suffixes?: [string, string, string][] } = {},
) {
  const suffixes = opts.suffixes ?? PLATFORM_SUFFIXES;
  const assets: {
    name: string;
    size: number;
    browser_download_url: string;
    digest?: string;
  }[] = [];
  for (const [os, arch, ext] of suffixes) {
    const name = `graalvm-community-${tag}_${os}-${arch}_bin.${ext}`;
    const url = `https://github.com/graalvm/graalvm-ce-builds/releases/download/${tag}/${name}`;
    assets.push({
      name,
      size: 1000,
      browser_download_url: url,
      ...(opts.digest ? { digest: `sha256:${'a'.repeat(64)}` } : {}),
    });
    assets.push({
      name: `${name}.sha256`,
      size: 64,
      browser_download_url: `${url}.sha256`,
    });
  }
  return assets;
}

function release(
  tag: string,
  opts: { digest?: boolean; suffixes?: [string, string, string][] } = {},
) {
  return {
    tag_name: tag,
    prerelease: false,
    draft: false,
    published_at: '2024-01-16T15:04:00Z',
    assets: assetsFor(tag, opts),
  };
}

const RELEASES_URL =
  'https://api.github.com/repos/graalvm/graalvm-ce-builds/releases?per_page=100';

function stubReleases(releases: unknown[]) {
  const fn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    if (String(input) === RELEASES_URL) {
      return new Response(JSON.stringify(releases));
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('resolveGraalvm — version input shapes', () => {
  it('picks the newest jdk-<major>.* tag for a major-only version', async () => {
    stubReleases([
      release('graal-25.2.4', { digest: true }), // Innovation tag, wrong scheme — must be excluded
      release('jdk-21.0.2', { digest: true }),
      release('jdk-21.0.1', { digest: true }),
      release('jdk-17.0.9', { digest: true }),
    ]);
    const result = await resolveGraalvm('21', { platforms: [LINUX_X64] });
    expect(result.major).toBe(21);
    expect(result.label).toBe('GraalVM CE 21.0.2');
  });

  it('matches a bare dotted full version by prefixing jdk-', async () => {
    stubReleases([release('jdk-21.0.2', { digest: true })]);
    const result = await resolveGraalvm('21.0.2', { platforms: [LINUX_X64] });
    expect(result.label).toBe('GraalVM CE 21.0.2');
  });

  it('accepts a jdk- prefixed full version verbatim', async () => {
    stubReleases([release('jdk-21.0.2', { digest: true })]);
    const result = await resolveGraalvm('jdk-21.0.2', {
      platforms: [LINUX_X64],
    });
    expect(result.label).toBe('GraalVM CE 21.0.2');
  });

  it('throws for a full version whose exact tag does not exist', async () => {
    stubReleases([release('jdk-21.0.2', { digest: true })]);
    await expect(
      resolveGraalvm('21.0.99', { platforms: [LINUX_X64] }),
    ).rejects.toThrow(/jdk-21\.0\.99/);
  });
});

describe('resolveGraalvm — binary resolution', () => {
  it('maps GitHub asset fields onto VendorBinary, using the inline digest', async () => {
    stubReleases([release('jdk-21.0.2', { digest: true })]);
    const result = await resolveGraalvm('21.0.2', { platforms: [LINUX_X64] });
    expect(result.binaries).toHaveLength(1);
    const bin = result.binaries[0]!;
    expect(bin.platform).toEqual(LINUX_X64);
    expect(bin.filename).toBe(
      'graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz',
    );
    expect(bin.url).toBe(
      'https://github.com/graalvm/graalvm-ce-builds/releases/download/jdk-21.0.2/graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz',
    );
    expect(bin.size).toBe(1000);
    expect(bin.sha256).toBe('a'.repeat(64));
    expect(bin.discovery).toBeUndefined();
  });

  it('never matches the .sha256 sibling asset as the archive itself', async () => {
    stubReleases([release('jdk-21.0.2', { digest: true })]);
    const result = await resolveGraalvm('21.0.2', { platforms: [LINUX_X64] });
    expect(result.binaries[0]!.filename).not.toMatch(/\.sha256$/);
  });

  it('falls back to install-time discovery when the asset has no inline digest', async () => {
    stubReleases([release('jdk-21.0.2', { digest: false })]);
    const result = await resolveGraalvm('21.0.2', { platforms: [LINUX_X64] });
    const bin = result.binaries[0]!;
    expect(bin.sha256).toBeUndefined();
    expect(bin.discovery).toEqual({
      integrity: { url: { sha256: '${url}.sha256' } },
    });
  });

  it('resolves multiple platforms in one release', async () => {
    stubReleases([release('jdk-21.0.2', { digest: true })]);
    const result = await resolveGraalvm('21.0.2', {
      platforms: [LINUX_X64, MAC_X64],
    });
    expect(result.binaries).toHaveLength(2);
    expect(result.binaries.map((b) => b.platform.os).sort()).toEqual([
      'linux',
      'osx',
    ]);
  });

  it('soft-skips a platform missing from the release (e.g. windows-aarch64)', async () => {
    // Real GraalVM CE releases never ship windows-aarch64.
    stubReleases([release('jdk-21.0.2', { digest: true })]);
    const result = await resolveGraalvm('21.0.2', {
      platforms: [LINUX_X64, WIN_AARCH64],
    });
    expect(result.binaries).toHaveLength(1);
    expect(result.binaries[0]!.platform.os).toBe('linux');
  });

  it('throws when no requested platform has an asset', async () => {
    stubReleases([
      release('jdk-21.0.2', {
        digest: true,
        suffixes: [['linux', 'x64', 'tar.gz']],
      }),
    ]);
    await expect(
      resolveGraalvm('21.0.2', { platforms: [WIN_AARCH64] }),
    ).rejects.toThrow(/No GraalVM CE binaries found for version '21\.0\.2'/);
  });
});

describe('resolveGraalvm — Innovation tag scheme', () => {
  it('throws a clear error when an exact graal-* tag is requested', async () => {
    stubReleases([release('graal-25.2.4', { digest: true })]);
    await expect(
      resolveGraalvm('graal-25.2.4', { platforms: [LINUX_X64] }),
    ).rejects.toThrow(/doesn't use the standard 'jdk-<major>\.…' tag/);
  });
});

describe('resolveGraalvm — options', () => {
  it('defaults to all six DEFAULT_PLATFORMS when none are given', async () => {
    stubReleases([release('jdk-21.0.2', { digest: true })]);
    const result = await resolveGraalvm('21.0.2');
    // linux×2 + macos×2 + windows-x64 — real GraalVM CE never ships
    // windows-aarch64, so only 5 of the 6 default platforms resolve.
    expect(result.binaries).toHaveLength(5);
  });

  it('forwards a token as a Bearer Authorization header', async () => {
    const fn = stubReleases([release('jdk-21.0.2', { digest: true })]);
    await resolveGraalvm('21.0.2', {
      platforms: [LINUX_X64],
      token: 'ghp_test123',
    });
    const init = fn.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer ghp_test123',
    );
  });
});
