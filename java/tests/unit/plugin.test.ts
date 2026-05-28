import { afterEach, describe, expect, it, vi } from 'vitest';
import { java } from '../../lib/plugin';
import type { JavaPlatform } from '../../lib/resolver';
import type { BuildContext } from '@lanka/dev';

afterEach(() => vi.unstubAllGlobals());

const LINUX_X64: JavaPlatform = {
  os: 'linux',
  arch: 'x86_64',
  adoptiumOs: 'linux',
  adoptiumArch: 'x64',
  homeSuffix: '',
};

function release() {
  return {
    release_name: 'jdk-21.0.11+10',
    version_data: { major: 21 },
    binaries: [
      {
        architecture: 'x64',
        os: 'linux',
        image_type: 'jdk',
        jvm_impl: 'hotspot',
        package: {
          checksum: 'sha-linux',
          link: 'https://github.com/adoptium/linux.tar.gz',
          name: 'OpenJDK21U-jdk_x64_linux.tar.gz',
          size: 999,
        },
      },
    ],
  };
}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) =>
      String(input).includes('os=linux')
        ? new Response(JSON.stringify([release()]))
        : new Response('not found', { status: 404 }),
    ),
  );
}

function makeCtx() {
  const logs: { scope: string; message: string }[] = [];
  const ctx: BuildContext = {
    log: (scope, message) => logs.push({ scope, message }),
    configDir: '/tmp',
    mode: '',
  };
  return { ctx, logs };
}

describe('java', () => {
  it('returns a plugin named "java"', () => {
    const plugin = java('21');
    expect(plugin.name).toBe('java');
    expect(typeof plugin.build).toBe('function');
  });

  it('does no I/O at construction time', () => {
    // No fetch stub installed — constructing must not touch the network.
    expect(() => java('21')).not.toThrow();
  });

  it('builds artifacts, vars and a launch group', async () => {
    stubFetch();
    const { ctx } = makeCtx();
    const result = await java('21', { platforms: [LINUX_X64] }).build(ctx);
    expect(result.artifacts).toHaveLength(1);
    expect(result.vars?.java_runtime_dir).toBe('${root}/runtimes');
    expect(result.launch).toEqual({ bin: '${java_bin}' });
  });

  it('logs the resolved OpenJDK version', async () => {
    stubFetch();
    const { ctx, logs } = makeCtx();
    await java('21', { platforms: [LINUX_X64] }).build(ctx);
    expect(logs).toEqual([{ scope: 'java', message: 'OpenJDK 21.0.11+10' }]);
  });

  it('forwards options through to the resolver', async () => {
    const fn = vi.fn(
      async (_input: string | URL) => new Response(JSON.stringify([release()])),
    );
    vi.stubGlobal('fetch', fn);
    const { ctx } = makeCtx();
    await java('21', {
      platforms: [LINUX_X64],
      apiBase: 'https://mirror.example/v3',
    }).build(ctx);
    expect(String(fn.mock.calls[0]![0])).toContain('https://mirror.example/v3');
  });

  it('propagates a resolver failure out of build', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );
    const { ctx } = makeCtx();
    await expect(
      java('21', { platforms: [LINUX_X64] }).build(ctx),
    ).rejects.toThrow(/No OpenJDK binaries found/);
  });
});
