import { afterEach, describe, expect, it, vi } from 'vitest';
import { dgpuj } from '../../lib/plugin';
import type { DgpujPlatform } from '../../lib/template';
import type { BuildContext } from '@opys/dev';

afterEach(() => vi.unstubAllGlobals());

const LINUX_X64: DgpujPlatform = {
  os: 'linux',
  arch: 'x86_64',
  target: 'x86_64-unknown-linux-gnu',
  ext: 'tar.gz',
  bin: 'dgpuj',
};

function stubReleases() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              tag_name: 'v0.3.0',
              prerelease: false,
              draft: false,
              published_at: '2026-06-22T00:00:00Z',
              assets: [
                {
                  name: 'dgpuj-x86_64-unknown-linux-gnu.tar.gz',
                  size: 1,
                  browser_download_url:
                    'https://x/dgpuj-x86_64-unknown-linux-gnu.tar.gz',
                  digest: 'sha256:aa',
                },
              ],
            },
          ]),
        ),
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

describe('dgpuj', () => {
  it('returns a plugin named "dgpuj"', () => {
    const plugin = dgpuj();
    expect(plugin.name).toBe('dgpuj');
    expect(typeof plugin.build).toBe('function');
  });

  it('does no I/O at construction time', () => {
    // No fetch stub installed — constructing must not touch the network.
    expect(() => dgpuj()).not.toThrow();
  });

  it('builds artifacts, vars and the bin/home launch groups', async () => {
    stubReleases();
    const { ctx } = makeCtx();
    const result = await dgpuj({ platforms: [LINUX_X64] }).build(ctx);
    expect(result.artifacts).toHaveLength(1);
    expect(result.vars?.dgpuj_dir).toBe('${root}/dgpuj');
    expect(result.launch).toEqual({
      bin: '${dgpuj_bin}',
      home: { rules: [], value: ['--dgpuj-home', '${java_home}'] },
    });
  });

  it('logs the resolved release tag and target count', async () => {
    stubReleases();
    const { ctx, logs } = makeCtx();
    await dgpuj({ platforms: [LINUX_X64] }).build(ctx);
    expect(logs).toEqual([{ scope: 'dgpuj', message: 'v0.3.0 (1 target(s))' }]);
  });

  it('propagates a resolve failure out of build', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
    const { ctx } = makeCtx();
    await expect(
      dgpuj({ platforms: [LINUX_X64] }).build(ctx),
    ).rejects.toThrow();
  });
});
