import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveJava } from '../../lib/template';
import type { JavaPlatform } from '../../lib/resolver';
import type { ConditionalVal } from '@torba/core';

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

const WIN_X64: JavaPlatform = {
  os: 'windows',
  arch: 'x86_64',
  adoptiumOs: 'windows',
  adoptiumArch: 'x64',
  homeSuffix: '',
};

function release(platform: JavaPlatform, releaseName = 'jdk-21.0.11+10') {
  return {
    release_name: releaseName,
    version_data: { major: 21 },
    binaries: [
      {
        architecture: platform.adoptiumArch,
        os: platform.adoptiumOs,
        image_type: 'jdk',
        jvm_impl: 'hotspot',
        package: {
          checksum: `sha-${platform.adoptiumOs}-${platform.adoptiumArch}`,
          link: `https://github.com/adoptium/${platform.adoptiumOs}.tar.gz`,
          name: `OpenJDK21U-jdk_${platform.adoptiumArch}_${platform.adoptiumOs}.tar.gz`,
          size: 999,
        },
      },
    ],
  };
}

function stubFetch(handler: (url: string) => Response | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const res = handler(String(input));
      return res ?? new Response('not found', { status: 404 });
    }),
  );
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

describe('resolveJava — vendor validation', () => {
  it('throws for an unsupported vendor', async () => {
    await expect(
      // @ts-expect-error — testing a runtime guard for an invalid vendor.
      resolveJava({ version: '21', vendor: 'graalvm' }),
    ).rejects.toThrow(/vendor 'graalvm' is not yet supported/);
  });

  it('accepts the openjdk vendor explicitly', async () => {
    stubFetch(() => new Response(JSON.stringify([release(LINUX_X64)])));
    const t = await resolveJava({
      version: '21',
      vendor: 'openjdk',
      platforms: [LINUX_X64],
    });
    expect(t.release.major).toBe(21);
  });
});

describe('resolveJava — artifacts', () => {
  it('emits one artifact per resolved binary', async () => {
    stubFetch((url) => {
      if (url.includes('os=linux'))
        return new Response(JSON.stringify([release(LINUX_X64)]));
      if (url.includes('os=mac'))
        return new Response(JSON.stringify([release(MAC_AARCH64)]));
      return null;
    });
    const t = await resolveJava({
      version: '21',
      platforms: [LINUX_X64, MAC_AARCH64],
    });
    expect(t.artifacts).toHaveLength(2);
  });

  it('places archives under ${java_runtime_dir} as a url source', async () => {
    stubFetch(() => new Response(JSON.stringify([release(LINUX_X64)])));
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    const art = t.artifacts[0]!;
    expect(art.path).toBe(
      '${java_runtime_dir}/OpenJDK21U-jdk_x64_linux.tar.gz',
    );
    expect(art.source).toEqual({
      kind: 'url',
      url: 'https://github.com/adoptium/linux.tar.gz',
    });
    expect(art.size).toBe(999);
    expect(art.integrity).toEqual({ sha256: 'sha-linux-x64' });
  });

  it('scopes each artifact with an os + arch ruleset', async () => {
    stubFetch(() => new Response(JSON.stringify([release(LINUX_X64)])));
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    expect(t.artifacts[0]!.rules).toEqual([
      { action: 'allow', os: { name: 'linux' } },
      { action: 'allow', os: { arch: 'x86_64' } },
    ]);
  });

  it('extracts each archive into the major-versioned runtime dir', async () => {
    stubFetch(() => new Response(JSON.stringify([release(LINUX_X64)])));
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    expect(t.artifacts[0]!.extract).toEqual([
      { kind: 'dump', into: '${java_runtime_dir}/jdk-21' },
    ]);
  });
});

describe('resolveJava — vars', () => {
  it('defines java_runtime_dir under ${root}/runtimes', async () => {
    stubFetch(() => new Response(JSON.stringify([release(LINUX_X64)])));
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    expect(t.vars.java_runtime_dir).toBe('${root}/runtimes');
  });

  it('builds a java_home arm with no suffix on linux', async () => {
    stubFetch(() => new Response(JSON.stringify([release(LINUX_X64)])));
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    const arm = armFor(t.vars.java_home as ConditionalVal[], 'linux');
    expect(arm.value).toBe('${java_runtime_dir}/jdk-21/jdk-21.0.11+10');
  });

  it('appends /Contents/Home to java_home on macOS', async () => {
    stubFetch((url) =>
      url.includes('os=mac')
        ? new Response(JSON.stringify([release(MAC_AARCH64)]))
        : null,
    );
    const t = await resolveJava({ version: '21', platforms: [MAC_AARCH64] });
    const arm = armFor(t.vars.java_home as ConditionalVal[], 'osx');
    expect(arm.value).toBe(
      '${java_runtime_dir}/jdk-21/jdk-21.0.11+10/Contents/Home',
    );
  });

  it('points java_bin at bin/java on non-windows platforms', async () => {
    stubFetch(() => new Response(JSON.stringify([release(LINUX_X64)])));
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    const arm = armFor(t.vars.java_bin as ConditionalVal[], 'linux');
    expect(arm.value).toBe('${java_home}/bin/java');
  });

  it('points java_bin at bin/java.exe on windows', async () => {
    stubFetch((url) =>
      url.includes('os=windows')
        ? new Response(JSON.stringify([release(WIN_X64)]))
        : null,
    );
    const t = await resolveJava({ version: '21', platforms: [WIN_X64] });
    const arm = armFor(t.vars.java_bin as ConditionalVal[], 'windows');
    expect(arm.value).toBe('${java_home}/bin/java.exe');
  });

  it('emits one java_home / java_bin arm per distinct OS, not per arch', async () => {
    const LINUX_AARCH64: JavaPlatform = {
      os: 'linux',
      arch: 'aarch64',
      adoptiumOs: 'linux',
      adoptiumArch: 'aarch64',
      homeSuffix: '',
    };
    stubFetch(() => new Response(JSON.stringify([release(LINUX_X64)])));
    // Both linux platforms resolve to the same (linux) release fixture.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([release(LINUX_X64)]))),
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
  it('forwards apiBase to the resolver', async () => {
    const fn = vi.fn(
      async (_input: string | URL) =>
        new Response(JSON.stringify([release(LINUX_X64)])),
    );
    vi.stubGlobal('fetch', fn);
    await resolveJava({
      version: '21',
      platforms: [LINUX_X64],
      apiBase: 'https://mirror.example/v3',
    });
    expect(String(fn.mock.calls[0]![0])).toContain('https://mirror.example/v3');
  });

  it('returns the resolved release metadata', async () => {
    stubFetch(() => new Response(JSON.stringify([release(LINUX_X64)])));
    const t = await resolveJava({ version: '21', platforms: [LINUX_X64] });
    expect(t.release.releaseName).toBe('jdk-21.0.11+10');
    expect(t.release.extractDir).toBe('jdk-21.0.11+10');
    expect(t.release.binaries).toHaveLength(1);
  });
});
