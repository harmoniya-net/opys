import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveZulu } from '../../lib/zulu';
import type { Platform } from '../../lib/platforms';

afterEach(() => vi.unstubAllGlobals());

const LINUX_X64: Platform = { os: 'linux', arch: 'x86_64' };
const MAC_AARCH64: Platform = { os: 'osx', arch: 'aarch64' };
const WIN_X64: Platform = { os: 'windows', arch: 'x86_64' };

function pkg(opts: {
  name?: string;
  javaVersion?: number[];
  distroVersion?: number[];
  sha256?: string;
  size?: number;
  downloadUrl?: string;
}) {
  return {
    name: opts.name ?? 'zulu21.52.15-ca-jdk21.0.12-linux_x64.tar.gz',
    download_url:
      opts.downloadUrl ??
      'https://cdn.azul.com/zulu/bin/zulu21.52.15-ca-jdk21.0.12-linux_x64.tar.gz',
    size: opts.size ?? 213079000,
    sha256_hash:
      opts.sha256 ??
      'b1a9df12e798770d1b2db43b402a80f1e6080cff6d5d1d1fbe5c768fb4225f6a',
    java_version: opts.javaVersion ?? [21, 0, 12],
    distro_version: opts.distroVersion ?? [21, 52, 15, 0],
  };
}

function stubFetch(handler: (url: string) => Response | null) {
  const fn = vi.fn(async (input: string | URL) => {
    const res = handler(String(input));
    return res ?? new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('resolveZulu — query construction', () => {
  it('queries linux-glibc (not bare linux) with tar.gz', async () => {
    const fn = stubFetch(() => new Response(JSON.stringify([pkg({})])));
    await resolveZulu('21', { platforms: [LINUX_X64] });
    const url = String(fn.mock.calls[0]![0]);
    expect(url).toContain('os=linux-glibc');
    expect(url).toContain('arch=x64');
    expect(url).toContain('archive_type=tar.gz');
    expect(url).toContain('crac_supported=false');
    expect(url).toContain('javafx_bundled=false');
    expect(url).toContain('release_status=ga');
    expect(url).toContain('availability_types=CA');
    expect(url).toContain('include_fields=sha256_hash');
    expect(url).toContain('include_fields=size');
  });

  it('queries windows with archive_type=zip', async () => {
    const fn = stubFetch(
      () =>
        new Response(
          JSON.stringify([
            pkg({
              name: 'zulu21.52.15-ca-jdk21.0.12-win_x64.zip',
              downloadUrl:
                'https://cdn.azul.com/zulu/bin/zulu21.52.15-ca-jdk21.0.12-win_x64.zip',
            }),
          ]),
        ),
    );
    await resolveZulu('21', { platforms: [WIN_X64] });
    expect(String(fn.mock.calls[0]![0])).toContain('archive_type=zip');
  });

  it('passes a full version straight through as java_version', async () => {
    const fn = stubFetch(() => new Response(JSON.stringify([pkg({})])));
    await resolveZulu('21.0.12', { platforms: [LINUX_X64] });
    expect(String(fn.mock.calls[0]![0])).toContain('java_version=21.0.12');
  });
});

describe('resolveZulu — binary resolution', () => {
  it('maps Azul package fields onto VendorBinary', async () => {
    stubFetch(() => new Response(JSON.stringify([pkg({})])));
    const result = await resolveZulu('21', { platforms: [LINUX_X64] });
    expect(result.binaries).toHaveLength(1);
    const bin = result.binaries[0]!;
    expect(bin.platform).toEqual(LINUX_X64);
    expect(bin.filename).toBe('zulu21.52.15-ca-jdk21.0.12-linux_x64.tar.gz');
    expect(bin.url).toBe(
      'https://cdn.azul.com/zulu/bin/zulu21.52.15-ca-jdk21.0.12-linux_x64.tar.gz',
    );
    expect(bin.size).toBe(213079000);
    expect(bin.sha256).toBe(
      'b1a9df12e798770d1b2db43b402a80f1e6080cff6d5d1d1fbe5c768fb4225f6a',
    );
  });

  it('resolves multiple platforms in one release', async () => {
    stubFetch((url) => {
      if (url.includes('os=linux-glibc'))
        return new Response(JSON.stringify([pkg({})]));
      if (url.includes('os=macos'))
        return new Response(
          JSON.stringify([
            pkg({ name: 'zulu21.52.15-ca-jdk21.0.12-macosx_aarch64.tar.gz' }),
          ]),
        );
      return null;
    });
    const result = await resolveZulu('21', {
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(result.binaries).toHaveLength(2);
    expect(result.binaries.map((b) => b.platform.os).sort()).toEqual([
      'linux',
      'osx',
    ]);
  });

  it('soft-skips a platform that returns an empty array', async () => {
    stubFetch((url) =>
      url.includes('os=linux-glibc')
        ? new Response(JSON.stringify([pkg({})]))
        : new Response(JSON.stringify([])),
    );
    const result = await resolveZulu('21', {
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(result.binaries).toHaveLength(1);
    expect(result.binaries[0]!.platform.os).toBe('linux');
  });

  it('soft-skips a platform that 404s', async () => {
    stubFetch((url) =>
      url.includes('os=linux-glibc')
        ? new Response(JSON.stringify([pkg({})]))
        : null,
    );
    const result = await resolveZulu('21', {
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(result.binaries).toHaveLength(1);
  });

  it('sorts candidates by java_version descending regardless of API order', async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify([
            pkg({ javaVersion: [21, 0, 10] }),
            pkg({ javaVersion: [21, 0, 12] }),
            pkg({ javaVersion: [21, 0, 11] }),
          ]),
        ),
    );
    const result = await resolveZulu('21', { platforms: [LINUX_X64] });
    expect(result.major).toBe(21);
    expect(result.label).toContain('21.0.12');
  });

  it('tolerates two candidates with an identical java_version', async () => {
    // Exercises the descending comparator's "fully equal" path (e.g. a PSU
    // and CPU stream published for the same patch).
    stubFetch(
      () =>
        new Response(
          JSON.stringify([
            pkg({ javaVersion: [21, 0, 12] }),
            pkg({ javaVersion: [21, 0, 12] }),
          ]),
        ),
    );
    const result = await resolveZulu('21', { platforms: [LINUX_X64] });
    expect(result.major).toBe(21);
  });
});

describe('resolveZulu — anchoring', () => {
  it('anchors every platform on the java_version most of them agree on', async () => {
    stubFetch((url) => {
      if (url.includes('os=linux-glibc'))
        return new Response(
          JSON.stringify([
            pkg({ javaVersion: [21, 0, 12] }),
            pkg({ javaVersion: [21, 0, 11] }),
          ]),
        );
      if (url.includes('os=windows'))
        return new Response(
          JSON.stringify([pkg({ javaVersion: [21, 0, 12] })]),
        );
      // macOS hasn't shipped 21.0.12 yet — only has the prior patch.
      if (url.includes('os=macos'))
        return new Response(
          JSON.stringify([pkg({ javaVersion: [21, 0, 11] })]),
        );
      return null;
    });
    const result = await resolveZulu('21', {
      platforms: [LINUX_X64, WIN_X64, MAC_AARCH64],
    });
    // linux + windows agree on 21.0.12 — that's the anchor; macOS is dropped.
    expect(result.label).toContain('21.0.12');
    expect(result.binaries).toHaveLength(2);
    expect(result.binaries.every((b) => b.platform.os !== 'osx')).toBe(true);
  });
});

describe('resolveZulu — label', () => {
  it('includes both the Zulu build version and the JDK version', async () => {
    stubFetch(() => new Response(JSON.stringify([pkg({})])));
    const result = await resolveZulu('21', { platforms: [LINUX_X64] });
    expect(result.label).toBe('Zulu 21.52.15.0 (JDK 21.0.12)');
    expect(result.major).toBe(21);
  });
});

describe('resolveZulu — errors', () => {
  it('throws when no platform yields a binary', async () => {
    stubFetch(() => new Response(JSON.stringify([])));
    await expect(resolveZulu('99', { platforms: [LINUX_X64] })).rejects.toThrow(
      /No Zulu binaries found for version '99'/,
    );
  });

  it('throws on a non-404 HTTP error from the Azul API', async () => {
    stubFetch(() => new Response('boom', { status: 403 }));
    await expect(resolveZulu('21', { platforms: [LINUX_X64] })).rejects.toThrow(
      /Azul API 403/,
    );
  });
});

describe('resolveZulu — options', () => {
  it('honours a custom apiBase', async () => {
    const fn = stubFetch(() => new Response(JSON.stringify([pkg({})])));
    await resolveZulu('21', {
      platforms: [LINUX_X64],
      apiBase: 'https://mirror.example/metadata/v1',
    });
    expect(String(fn.mock.calls[0]![0])).toContain(
      'https://mirror.example/metadata/v1',
    );
  });
});
