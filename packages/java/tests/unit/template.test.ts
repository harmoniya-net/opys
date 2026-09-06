import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveJava } from '../../lib/template';
import type { Platform } from '../../lib/platforms';
import type { ConditionalVal } from '@opys/core';

afterEach(() => vi.unstubAllGlobals());

const LINUX_X64: Platform = { os: 'linux', arch: 'x86_64' };
const MAC_AARCH64: Platform = { os: 'osx', arch: 'aarch64' };
const WIN_X64: Platform = { os: 'windows', arch: 'x86_64' };

function temurinRelease(platform: Platform, releaseName = 'jdk-21.0.11+10') {
  const adoptiumOs = platform.os === 'osx' ? 'mac' : platform.os;
  const adoptiumArch = platform.arch === 'x86_64' ? 'x64' : platform.arch;
  return {
    release_name: releaseName,
    version_data: { major: 21 },
    binaries: [
      {
        architecture: adoptiumArch,
        os: adoptiumOs,
        image_type: 'jdk',
        jvm_impl: 'hotspot',
        package: {
          checksum: `sha-${adoptiumOs}-${adoptiumArch}`,
          link: `https://github.com/adoptium/${adoptiumOs}.tar.gz`,
          name: `OpenJDK21U-jdk_${adoptiumArch}_${adoptiumOs}.tar.gz`,
          size: 999,
        },
      },
    ],
  };
}

function stubTemurinFetch(handler: (url: string) => Response | null) {
  const fn = vi.fn(async (input: string | URL) => {
    const res = handler(String(input));
    return res ?? new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Find the arm of a ConditionalVal list whose rules allow exactly `os`. */
function armFor(arms: ConditionalVal[], os: string): ConditionalVal {
  const arm = arms.find((a) =>
    a.rules.some(
      (r) =>
        typeof r === 'object' &&
        'os' in r &&
        (r.os as { name?: string }).name === os,
    ),
  );
  if (!arm) throw new Error(`no arm for ${os}`);
  return arm;
}

describe('resolveJava — vendor dispatch', () => {
  it('defaults to temurin when vendor is omitted', async () => {
    const fn = stubTemurinFetch(
      () => new Response(JSON.stringify([temurinRelease(LINUX_X64)])),
    );
    await resolveJava({ version: '21', platforms: [LINUX_X64] });
    expect(String(fn.mock.calls[0]![0])).toContain('api.adoptium.net');
  });

  it('throws for an unsupported vendor', async () => {
    await expect(
      // @ts-expect-error — testing a runtime guard for an invalid vendor.
      resolveJava({ version: '21', vendor: 'liberica' }),
    ).rejects.toThrow(
      /vendor 'liberica' is not supported \(expected 'temurin', 'zulu', or 'graalvm'\)/,
    );
  });

  it('dispatches vendor: zulu to the Azul Metadata API', async () => {
    const fn = vi.fn(async (input: string | URL) =>
      String(input).includes('api.azul.com')
        ? new Response(
            JSON.stringify([
              {
                name: 'zulu21.52.15-ca-jdk21.0.12-linux_x64.tar.gz',
                download_url:
                  'https://cdn.azul.com/zulu/bin/zulu21.52.15-ca-jdk21.0.12-linux_x64.tar.gz',
                size: 1000,
                sha256_hash: 'a'.repeat(64),
                java_version: [21, 0, 12],
                distro_version: [21, 52, 15, 0],
              },
            ]),
          )
        : new Response('not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fn);
    const t = await resolveJava({
      version: '21',
      vendor: 'zulu',
      platforms: [LINUX_X64],
    });
    expect(t.release.label).toContain('Zulu');
    expect(String(fn.mock.calls[0]![0])).toContain('api.azul.com');
  });

  it('dispatches vendor: graalvm to the GitHub releases API', async () => {
    const fn = vi.fn(async (input: string | URL) =>
      String(input).includes('api.github.com/repos/graalvm/graalvm-ce-builds')
        ? new Response(
            JSON.stringify([
              {
                tag_name: 'jdk-21.0.2',
                prerelease: false,
                draft: false,
                published_at: '2024-01-16T15:04:00Z',
                assets: [
                  {
                    name: 'graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz',
                    size: 1000,
                    browser_download_url:
                      'https://github.com/graalvm/graalvm-ce-builds/releases/download/jdk-21.0.2/graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz',
                    digest: `sha256:${'a'.repeat(64)}`,
                  },
                ],
              },
            ]),
          )
        : new Response('not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fn);
    const t = await resolveJava({
      version: '21.0.2',
      vendor: 'graalvm',
      platforms: [LINUX_X64],
    });
    expect(t.release.label).toBe('GraalVM CE 21.0.2');
    expect(String(fn.mock.calls[0]![0])).toContain('api.github.com');
  });

  it('carries a discovery fallback onto the artifact when a binary has no sha256', async () => {
    const fn = vi.fn(async (input: string | URL) =>
      String(input).includes('api.github.com/repos/graalvm/graalvm-ce-builds')
        ? new Response(
            JSON.stringify([
              {
                tag_name: 'jdk-21.0.2',
                prerelease: false,
                draft: false,
                published_at: '2024-01-16T15:04:00Z',
                assets: [
                  {
                    name: 'graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz',
                    size: 1000,
                    browser_download_url:
                      'https://github.com/graalvm/graalvm-ce-builds/releases/download/jdk-21.0.2/graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz',
                    // no `digest` field — an older, pre-2024 release asset.
                  },
                ],
              },
            ]),
          )
        : new Response('not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fn);
    const t = await resolveJava({
      version: '21.0.2',
      vendor: 'graalvm',
      platforms: [LINUX_X64],
    });
    const art = t.artifacts[0]!;
    expect(art.integrity).toBeUndefined();
    expect(art.discovery).toEqual({
      integrity: { url: { sha256: '${url}.sha256' } },
    });
  });

  it('forwards apiBase to the temurin resolver', async () => {
    const fn = stubTemurinFetch(
      () => new Response(JSON.stringify([temurinRelease(LINUX_X64)])),
    );
    await resolveJava({
      version: '21',
      platforms: [LINUX_X64],
      apiBase: 'https://mirror.example/v3',
    });
    expect(String(fn.mock.calls[0]![0])).toContain('https://mirror.example/v3');
  });
});

describe('resolveJava — artifacts', () => {
  it('emits one artifact per resolved binary', async () => {
    stubTemurinFetch((url) => {
      if (url.includes('os=linux'))
        return new Response(JSON.stringify([temurinRelease(LINUX_X64)]));
      if (url.includes('os=mac'))
        return new Response(JSON.stringify([temurinRelease(MAC_AARCH64)]));
      return null;
    });
    const t = await resolveJava({
      version: '21',
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(t.artifacts).toHaveLength(2);
  });

  it('places archives under ${java_runtime_dir} as a url source', async () => {
    stubTemurinFetch(
      () => new Response(JSON.stringify([temurinRelease(LINUX_X64)])),
    );
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    const art = t.artifacts[0]!;
    expect(art.path).toBe(
      '${java_runtime_dir}/OpenJDK21U-jdk_x64_linux.tar.gz',
    );
    expect(art.source).toEqual({
      url: 'https://github.com/adoptium/linux.tar.gz',
    });
    expect(art.size).toBe(999);
    expect(art.integrity).toEqual({ sha256: 'sha-linux-x64' });
  });

  it('scopes each artifact with an os + arch ruleset', async () => {
    stubTemurinFetch(
      () => new Response(JSON.stringify([temurinRelease(LINUX_X64)])),
    );
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    expect(t.artifacts[0]!.rules).toEqual([
      { action: 'allow', os: { name: 'linux' } },
      { action: 'allow', os: { arch: 'x86_64' } },
    ]);
  });

  it('extracts with a glob-strip scan into the major-versioned runtime dir', async () => {
    stubTemurinFetch(
      () => new Response(JSON.stringify([temurinRelease(LINUX_X64)])),
    );
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    expect(t.artifacts[0]!.extract).toEqual([
      {
        matches: '*',
        into: '${java_runtime_dir}/jdk-21',
        strip: ['*/'],
      },
    ]);
  });
});

describe('resolveJava — vars', () => {
  it('defines java_runtime_dir under ${root}/runtimes', async () => {
    stubTemurinFetch(
      () => new Response(JSON.stringify([temurinRelease(LINUX_X64)])),
    );
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    expect(t.vars.java_runtime_dir).toBe('${root}/runtimes');
  });

  it('builds a java_home arm with no suffix on linux', async () => {
    stubTemurinFetch(
      () => new Response(JSON.stringify([temurinRelease(LINUX_X64)])),
    );
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    const arm = armFor(t.vars.java_home as ConditionalVal[], 'linux');
    expect(arm.value).toBe('${java_runtime_dir}/jdk-21');
  });

  it('appends /Contents/Home to java_home on macOS', async () => {
    stubTemurinFetch((url) =>
      url.includes('os=mac')
        ? new Response(JSON.stringify([temurinRelease(MAC_AARCH64)]))
        : null,
    );
    const t = await resolveJava({ version: '21', platforms: [MAC_AARCH64] });
    const arm = armFor(t.vars.java_home as ConditionalVal[], 'osx');
    expect(arm.value).toBe('${java_runtime_dir}/jdk-21/Contents/Home');
  });

  it('points java_bin at bin/java on non-windows platforms', async () => {
    stubTemurinFetch(
      () => new Response(JSON.stringify([temurinRelease(LINUX_X64)])),
    );
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    const arm = armFor(t.vars.java_bin as ConditionalVal[], 'linux');
    expect(arm.value).toBe('${java_home}/bin/java');
  });

  it('defaults java_bin to javaw.exe on windows, java.exe behind java_console', async () => {
    stubTemurinFetch((url) =>
      url.includes('os=windows')
        ? new Response(JSON.stringify([temurinRelease(WIN_X64)]))
        : null,
    );
    const t = await resolveJava({ version: '21', platforms: [WIN_X64] });
    const arms = t.vars.java_bin as ConditionalVal[];

    // Default (no feature): javaw.exe — its arm disallows java_console.
    const javaw = arms.find((a) => a.value === '${java_home}/bin/javaw.exe')!;
    expect(javaw).toBeDefined();
    expect(javaw.rules).toContainEqual({
      action: 'disallow',
      features: { java_console: true },
    });

    // java.exe is gated behind the java_console feature being enabled.
    const javaExe = arms.find((a) => a.value === '${java_home}/bin/java.exe')!;
    expect(javaExe).toBeDefined();
    expect(javaExe.rules).toContainEqual({
      action: 'allow',
      features: { java_console: true },
    });

    // Both arms still scope to windows.
    for (const arm of [javaw, javaExe]) {
      expect(arm.rules).toContainEqual({
        action: 'allow',
        os: { name: 'windows' },
      });
    }
  });

  it('emits one java_home / java_bin arm per distinct OS, not per arch', async () => {
    const LINUX_AARCH64: Platform = { os: 'linux', arch: 'aarch64' };
    // Both linux platforms resolve to the same (linux) release fixture.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify([temurinRelease(LINUX_X64)])),
      ),
    );
    const t = await resolveJava({
      version: '21',
      platforms: [LINUX_X64, LINUX_AARCH64],
    });
    // Two artifacts (one per arch) but a single java_home arm (one per OS).
    expect(t.vars.java_home as ConditionalVal[]).toHaveLength(1);
    expect(t.vars.java_bin as ConditionalVal[]).toHaveLength(1);
  });
});

describe('resolveJava — passthrough', () => {
  it('returns the resolved release metadata', async () => {
    stubTemurinFetch(
      () => new Response(JSON.stringify([temurinRelease(LINUX_X64)])),
    );
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    expect(t.release.label).toBe('Temurin 21.0.11+10');
    expect(t.release.major).toBe(21);
    expect(t.release.binaries).toHaveLength(1);
  });
});
