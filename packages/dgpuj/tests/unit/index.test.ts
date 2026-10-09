/**
 * The JS half of `@opys/dgpuj`: the typed surface and the plugin closure.
 *
 * Which release, which asset per target, the rules and the vars are the
 * `opys-dgpuj` crate's and are tested there. What is left here is what only
 * exists on this side: that each wrapper reaches the right native call, that
 * what comes back is usable, and that the plugin logs the release it resolved.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BuildContext } from '@opys/dev';
import {
  dgpuj,
  resolveDgpuj,
  DEFAULT_PLATFORMS,
  DEFAULT_REPO,
  type DgpujPlatform,
} from '../../lib/index';

const LINUX_X64: DgpujPlatform = {
  os: 'linux',
  arch: 'x86_64',
  target: 'x86_64-unknown-linux-gnu',
  ext: 'tar.gz',
  bin: 'dgpuj',
};
const ASSET = 'dgpuj-x86_64-unknown-linux-gnu.tar.gz';

/** Stands in for GitHub's releases API. */
let server: Server;
let base: string;
let targets: string[];

beforeEach(async () => {
  targets = [];
  server = createServer((req, res) => {
    targets.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify([
        {
          tag_name: 'v0.3.0',
          prerelease: false,
          draft: false,
          published_at: '2026-06-22T00:00:00Z',
          assets: [
            {
              name: ASSET,
              size: 4242,
              browser_download_url: `https://x/${ASSET}`,
              digest: `sha256:${'a'.repeat(64)}`,
            },
          ],
        },
      ]),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

const options = () => ({ apiBase: base, platforms: [LINUX_X64] });

function makeCtx() {
  const logs: { scope: string; message: string }[] = [];
  const ctx: BuildContext = {
    log: (scope, message) => logs.push({ scope, message }),
    configDir: '/tmp',
    mode: '',
  };
  return { ctx, logs };
}

describe('defaults', () => {
  it('come from the crate rather than being restated here', () => {
    expect(DEFAULT_REPO).toBe('harmoniya-net/dgpuj');
    expect(DEFAULT_PLATFORMS.map((p) => p.target)).toEqual([
      'x86_64-pc-windows-msvc',
      'aarch64-pc-windows-msvc',
      'x86_64-unknown-linux-gnu',
      'aarch64-apple-darwin',
      'x86_64-apple-darwin',
    ]);
    expect(DEFAULT_PLATFORMS[0]).toMatchObject({
      ext: 'zip',
      bin: 'dgpuj.exe',
    });
  });
});

describe('resolveDgpuj', () => {
  it('returns artifacts, vars and the release, readable as manifest types', async () => {
    const t = await resolveDgpuj(options());

    expect(t.release.tag_name).toBe('v0.3.0');
    expect(t.artifacts).toEqual([
      {
        path: `\${dgpuj_dir}/${ASSET}`,
        source: { url: `https://x/${ASSET}` },
        size: 4242,
        rules: ['allow.os.linux', 'allow.arch.x86_64'],
        integrity: { sha256: 'a'.repeat(64) },
        extract: { file: 'dgpuj', into: '${dgpuj_dir}/dgpuj' },
      },
    ]);
    expect(t.vars.dgpuj_dir).toBe('${root}/dgpuj');
    expect(targets).toEqual([
      '/repos/harmoniya-net/dgpuj/releases?per_page=100',
    ]);
  });

  it('passes the repo through', async () => {
    await resolveDgpuj({ ...options(), repo: 'me/fork' });
    expect(targets[0]).toMatch(/^\/repos\/me\/fork\/releases/);
  });

  it('rejects with the crate’s error when a target has no asset', async () => {
    await expect(
      resolveDgpuj({ apiBase: base, platforms: [DEFAULT_PLATFORMS[0]!] }),
    ).rejects.toThrow(
      /No matching asset \(dgpuj-x86_64-pc-windows-msvc\.zip\)/,
    );
  });
});

describe('dgpuj()', () => {
  it('is pure to construct', () => {
    const plugin = dgpuj();
    expect(plugin.name).toBe('dgpuj');
    expect(targets).toEqual([]);
  });

  it('logs the release and target count, with one request', async () => {
    const { ctx, logs } = makeCtx();
    const contribution = await dgpuj(options()).build(ctx);

    expect(logs).toEqual([{ scope: 'dgpuj', message: 'v0.3.0 (1 target(s))' }]);
    expect(targets).toHaveLength(1);
    expect(contribution.artifacts).toHaveLength(1);
    expect(contribution.vars).toHaveProperty('dgpuj_bin');
    expect(contribution.launch).toEqual({ bin: '${dgpuj_bin}' });
  });

  it('propagates a resolve failure out of build', async () => {
    const { ctx } = makeCtx();
    await expect(
      dgpuj({ apiBase: `${base}/x`, version: 'v9', platforms: [LINUX_X64] })
        // The stand-in answers every path with a listing, which is not a
        // release — so a by-tag fetch fails to decode.
        .build(ctx),
    ).rejects.toThrow();
  });
});
