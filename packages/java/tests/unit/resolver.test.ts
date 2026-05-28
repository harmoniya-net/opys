import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveOpenjdk,
  DEFAULT_PLATFORMS,
  type JavaPlatform,
} from '../../lib/resolver';

afterEach(() => vi.unstubAllGlobals());

const LINUX_X64: JavaPlatform = {
  os: 'linux',
  arch: 'x86_64',
  adoptiumOs: 'linux',
  adoptiumArch: 'x64',
  homeSuffix: '',
};

const MAC_AARCH64: JavaPlatform = {
  os: 'osx',
  arch: 'aarch64',
  adoptiumOs: 'mac',
  adoptiumArch: 'aarch64',
  homeSuffix: '/Contents/Home',
};

/** Build one Adoptium-shaped release for a given platform. */
function release(
  platform: JavaPlatform,
  releaseName = 'jdk-21.0.11+10',
  major = 21,
) {
  return {
    release_name: releaseName,
    version_data: { major },
    binaries: [
      {
        architecture: platform.adoptiumArch,
        os: platform.adoptiumOs,
        image_type: 'jdk',
        jvm_impl: 'hotspot',
        package: {
          checksum: 'abc123',
          link: `https://github.com/adoptium/${releaseName}-${platform.adoptiumOs}-${platform.adoptiumArch}.tar.gz`,
          name: `OpenJDK21U-jdk_${platform.adoptiumArch}_${platform.adoptiumOs}_hotspot.tar.gz`,
          size: 12345,
        },
      },
    ],
  };
}

/**
 * Stub fetch with a per-URL handler. The handler maps the request URL to a
 * Response (or `null` for a 404).
 */
function stubFetch(handler: (url: string) => Response | null) {
  const fn = vi.fn(async (input: string | URL) => {
    const url = String(input);
    const res = handler(url);
    return res ?? new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('DEFAULT_PLATFORMS', () => {
  it('covers linux/osx/windows across x86_64 and aarch64', () => {
    expect(DEFAULT_PLATFORMS).toHaveLength(6);
    const keys = DEFAULT_PLATFORMS.map((p) => `${p.os}/${p.arch}`).sort();
    expect(keys).toEqual([
      'linux/aarch64',
      'linux/x86_64',
      'osx/aarch64',
      'osx/x86_64',
      'windows/aarch64',
      'windows/x86_64',
    ]);
  });

  it('only attaches the /Contents/Home suffix to macOS platforms', () => {
    for (const p of DEFAULT_PLATFORMS) {
      if (p.os === 'osx') expect(p.homeSuffix).toBe('/Contents/Home');
      else expect(p.homeSuffix).toBe('');
    }
  });
});

describe('resolveOpenjdk — version input shapes', () => {
  it('uses the feature_releases endpoint for a major-only version', async () => {
    const fn = stubFetch((url) =>
      url.includes('/feature_releases/21/ga')
        ? new Response(JSON.stringify([release(LINUX_X64)]))
        : null,
    );
    const result = await resolveOpenjdk('21', { platforms: [LINUX_X64] });
    expect(result.major).toBe(21);
    expect(result.releaseName).toBe('jdk-21.0.11+10');
    expect(fn.mock.calls[0]![0]).toContain('/feature_releases/21/ga');
  });

  it('uses the release_name endpoint for a full version', async () => {
    const fn = stubFetch((url) =>
      url.includes('/release_name/eclipse/')
        ? new Response(JSON.stringify(release(LINUX_X64)))
        : null,
    );
    const result = await resolveOpenjdk('21.0.11+10', {
      platforms: [LINUX_X64],
    });
    expect(result.releaseName).toBe('jdk-21.0.11+10');
    const url = String(fn.mock.calls[0]![0]);
    expect(url).toContain('/release_name/eclipse/');
    // `jdk-` prefix is added and the `+` is URL-encoded.
    expect(url).toContain('jdk-21.0.11%2B10');
  });

  it('tolerates a jdk- prefix on the input version', async () => {
    const fn = stubFetch((url) =>
      url.includes('/release_name/eclipse/')
        ? new Response(JSON.stringify(release(LINUX_X64)))
        : null,
    );
    await resolveOpenjdk('jdk-21.0.11+10', { platforms: [LINUX_X64] });
    // A `jdk-`-prefixed input is already a release name — used verbatim.
    const url = String(fn.mock.calls[0]![0]);
    expect(url).toContain('release_name/eclipse/jdk-21.0.11%2B10');
    expect(url).not.toContain('jdk-jdk-');
  });

  it('builds the hyphen-less jdk8u… release name for a Java 8 version', async () => {
    const fn = stubFetch((url) =>
      url.includes('/release_name/eclipse/')
        ? new Response(JSON.stringify(release(LINUX_X64, 'jdk8u492-b09', 8)))
        : null,
    );
    const result = await resolveOpenjdk('8u492-b09', {
      platforms: [LINUX_X64],
    });
    expect(result.releaseName).toBe('jdk8u492-b09');
    const url = String(fn.mock.calls[0]![0]);
    // Java 8 names are `jdk8u…` — no hyphen after `jdk`, and no `jdk-jdk`.
    expect(url).toContain('release_name/eclipse/jdk8u492-b09');
    expect(url).not.toContain('jdk-8u');
  });

  it('accepts a full jdk8u… release name verbatim', async () => {
    const fn = stubFetch((url) =>
      url.includes('/release_name/eclipse/')
        ? new Response(JSON.stringify(release(LINUX_X64, 'jdk8u492-b09', 8)))
        : null,
    );
    await resolveOpenjdk('jdk8u492-b09', { platforms: [LINUX_X64] });
    expect(String(fn.mock.calls[0]![0])).toContain(
      'release_name/eclipse/jdk8u492-b09',
    );
  });

  it('tolerates a -LTS suffix on the input version', async () => {
    stubFetch((url) =>
      url.includes('/release_name/eclipse/')
        ? new Response(JSON.stringify(release(LINUX_X64)))
        : null,
    );
    const result = await resolveOpenjdk('21.0.11+10-LTS', {
      platforms: [LINUX_X64],
    });
    expect(result.releaseName).toBe('jdk-21.0.11+10');
  });

  it('trims surrounding whitespace from the input version', async () => {
    const fn = stubFetch(
      () => new Response(JSON.stringify([release(LINUX_X64)])),
    );
    await resolveOpenjdk('  21  ', { platforms: [LINUX_X64] });
    expect(fn.mock.calls[0]![0]).toContain('/feature_releases/21/ga');
  });
});

describe('resolveOpenjdk — binary resolution', () => {
  it('maps Adoptium package fields onto JavaBinary', async () => {
    stubFetch(() => new Response(JSON.stringify([release(LINUX_X64)])));
    const result = await resolveOpenjdk('21', { platforms: [LINUX_X64] });
    expect(result.binaries).toHaveLength(1);
    const bin = result.binaries[0]!;
    expect(bin.platform).toEqual(LINUX_X64);
    expect(bin.filename).toBe('OpenJDK21U-jdk_x64_linux_hotspot.tar.gz');
    expect(bin.url).toContain('github.com/adoptium');
    expect(bin.size).toBe(12345);
    expect(bin.sha256).toBe('abc123');
  });

  it('sets extractDir equal to releaseName', async () => {
    stubFetch(() => new Response(JSON.stringify([release(LINUX_X64)])));
    const result = await resolveOpenjdk('21', { platforms: [LINUX_X64] });
    expect(result.extractDir).toBe(result.releaseName);
  });

  it('resolves multiple platforms in one release', async () => {
    stubFetch((url) => {
      if (url.includes('os=linux'))
        return new Response(JSON.stringify([release(LINUX_X64)]));
      if (url.includes('os=mac'))
        return new Response(JSON.stringify([release(MAC_AARCH64)]));
      return null;
    });
    const result = await resolveOpenjdk('21', {
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(result.binaries).toHaveLength(2);
    expect(result.binaries.map((b) => b.platform.os).sort()).toEqual([
      'linux',
      'osx',
    ]);
  });

  it('soft-skips a platform that returns 404', async () => {
    stubFetch((url) =>
      url.includes('os=linux')
        ? new Response(JSON.stringify([release(LINUX_X64)]))
        : null,
    );
    const result = await resolveOpenjdk('21', {
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(result.binaries).toHaveLength(1);
    expect(result.binaries[0]!.platform.os).toBe('linux');
  });

  it('soft-skips a release with no binaries array', async () => {
    stubFetch((url) => {
      if (url.includes('os=linux'))
        return new Response(JSON.stringify([release(LINUX_X64)]));
      // mac responds with a release object missing `binaries`.
      return new Response(
        JSON.stringify([
          { release_name: 'jdk-21', version_data: { major: 21 } },
        ]),
      );
    });
    const result = await resolveOpenjdk('21', {
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(result.binaries).toHaveLength(1);
  });

  it('soft-skips a release with an empty binaries array', async () => {
    stubFetch((url) => {
      if (url.includes('os=linux'))
        return new Response(JSON.stringify([release(LINUX_X64)]));
      return new Response(
        JSON.stringify([
          { release_name: 'jdk-21', version_data: { major: 21 }, binaries: [] },
        ]),
      );
    });
    const result = await resolveOpenjdk('21', {
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(result.binaries).toHaveLength(1);
  });

  it('soft-skips when no binary matches the requested arch/os', async () => {
    stubFetch((url) => {
      if (url.includes('os=linux'))
        return new Response(JSON.stringify([release(LINUX_X64)]));
      // mac response carries a linux binary instead — no match.
      return new Response(JSON.stringify([release(LINUX_X64)]));
    });
    const result = await resolveOpenjdk('21', {
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(result.binaries).toHaveLength(1);
    expect(result.binaries[0]!.platform.os).toBe('linux');
  });

  it('handles a single release object (not an array) from release_name', async () => {
    stubFetch(() => new Response(JSON.stringify(release(LINUX_X64))));
    const result = await resolveOpenjdk('21.0.11+10', {
      platforms: [LINUX_X64],
    });
    expect(result.binaries).toHaveLength(1);
  });

  it('soft-skips an empty array body', async () => {
    stubFetch((url) =>
      url.includes('os=linux')
        ? new Response(JSON.stringify([release(LINUX_X64)]))
        : new Response(JSON.stringify([])),
    );
    const result = await resolveOpenjdk('21', {
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(result.binaries).toHaveLength(1);
  });
});

describe('resolveOpenjdk — release name anchoring', () => {
  it('anchors to the most common release_name and drops mismatches', async () => {
    // linux + windows agree on jdk-21.0.11+10; mac resolves to a different GA.
    const WIN_X64: JavaPlatform = {
      os: 'windows',
      arch: 'x86_64',
      adoptiumOs: 'windows',
      adoptiumArch: 'x64',
      homeSuffix: '',
    };
    stubFetch((url) => {
      if (url.includes('os=linux'))
        return new Response(JSON.stringify([release(LINUX_X64)]));
      if (url.includes('os=windows'))
        return new Response(JSON.stringify([release(WIN_X64)]));
      if (url.includes('os=mac'))
        return new Response(
          JSON.stringify([release(MAC_AARCH64, 'jdk-21.0.10+7', 21)]),
        );
      return null;
    });
    const result = await resolveOpenjdk('21', {
      platforms: [LINUX_X64, WIN_X64, MAC_AARCH64],
    });
    expect(result.releaseName).toBe('jdk-21.0.11+10');
    expect(result.binaries).toHaveLength(2);
    expect(result.binaries.every((b) => b.platform.os !== 'osx')).toBe(true);
  });

  it('breaks a release_name tie deterministically by name', async () => {
    // Two platforms, two distinct release names — one each.
    stubFetch((url) => {
      if (url.includes('os=linux'))
        return new Response(
          JSON.stringify([release(LINUX_X64, 'jdk-21.0.1+1')]),
        );
      if (url.includes('os=mac'))
        return new Response(
          JSON.stringify([release(MAC_AARCH64, 'jdk-21.0.2+2')]),
        );
      return null;
    });
    const result = await resolveOpenjdk('21', {
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    // Tie-break sorts so the lexicographically larger name wins.
    expect(result.releaseName).toBe('jdk-21.0.2+2');
    expect(result.binaries).toHaveLength(1);
  });

  it('breaks a release_name tie the same way regardless of fetch order', async () => {
    // Same two names as above but emitted in the opposite platform order,
    // exercising the other side of the tie-break comparator.
    stubFetch((url) => {
      if (url.includes('os=linux'))
        return new Response(
          JSON.stringify([release(LINUX_X64, 'jdk-21.0.2+2')]),
        );
      if (url.includes('os=mac'))
        return new Response(
          JSON.stringify([release(MAC_AARCH64, 'jdk-21.0.1+1')]),
        );
      return null;
    });
    const result = await resolveOpenjdk('21', {
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(result.releaseName).toBe('jdk-21.0.2+2');
  });
});

describe('resolveOpenjdk — errors', () => {
  it('throws when no platform yields a binary', async () => {
    stubFetch(() => null);
    await expect(
      resolveOpenjdk('99', { platforms: [LINUX_X64] }),
    ).rejects.toThrow(/No OpenJDK binaries found for version '99'/);
  });

  it('throws on a non-404 HTTP error from the Adoptium API', async () => {
    stubFetch(() => new Response('boom', { status: 403 }));
    await expect(
      resolveOpenjdk('21', { platforms: [LINUX_X64] }),
    ).rejects.toThrow(/Adoptium API 403/);
  });

  it('names the failing platform in the HTTP error', async () => {
    stubFetch(
      () => new Response('boom', { status: 500, statusText: 'Server Error' }),
    );
    const err = await resolveOpenjdk('21', { platforms: [MAC_AARCH64] }).catch(
      (e) => e,
    );
    // 500 is a retry status; fetchWithRetry exhausts retries then returns it.
    expect(String(err)).toContain('mac/aarch64');
  }, 20000);
});

describe('resolveOpenjdk — options', () => {
  it('honours a custom apiBase', async () => {
    const fn = stubFetch(
      () => new Response(JSON.stringify([release(LINUX_X64)])),
    );
    await resolveOpenjdk('21', {
      platforms: [LINUX_X64],
      apiBase: 'https://mirror.example/v3',
    });
    expect(String(fn.mock.calls[0]![0])).toContain('https://mirror.example/v3');
  });

  it('defaults to all six DEFAULT_PLATFORMS when none are given', async () => {
    const fn = stubFetch(
      () => new Response(JSON.stringify([release(LINUX_X64)])),
    );
    await resolveOpenjdk('21');
    expect(fn).toHaveBeenCalledTimes(6);
  });
});
