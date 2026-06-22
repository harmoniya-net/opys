import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveDgpuj,
  DEFAULT_PLATFORMS,
  type DgpujPlatform,
} from '../../lib/template';

afterEach(() => vi.unstubAllGlobals());

const LINUX_X64: DgpujPlatform = {
  os: 'linux',
  arch: 'x86_64',
  target: 'x86_64-unknown-linux-gnu',
  ext: 'tar.gz',
  bin: 'dgpuj',
};
const WIN_X64: DgpujPlatform = {
  os: 'windows',
  arch: 'x86_64',
  target: 'x86_64-pc-windows-msvc',
  ext: 'zip',
  bin: 'dgpuj.exe',
};

function releasesJson(names: string[]) {
  return [
    {
      tag_name: 'v0.3.0',
      prerelease: false,
      draft: false,
      published_at: '2026-06-22T00:00:00Z',
      assets: names.map((name) => ({
        name,
        size: 123,
        browser_download_url: `https://github.com/harmoniya-net/dgpuj/releases/download/v0.3.0/${name}`,
        digest: 'sha256:abc123',
      })),
    },
  ];
}

function stubReleases(names: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(releasesJson(names)))),
  );
}

describe('resolveDgpuj', () => {
  it('maps each platform to an OS+arch-scoped, extracting artifact', async () => {
    stubReleases([
      'dgpuj-x86_64-unknown-linux-gnu.tar.gz',
      'dgpuj-x86_64-pc-windows-msvc.zip',
    ]);
    const { artifacts } = await resolveDgpuj({
      platforms: [LINUX_X64, WIN_X64],
    });
    expect(artifacts).toHaveLength(2);

    const [lin, win] = artifacts;
    expect(lin!.path).toBe(
      '${dgpuj_dir}/dgpuj-x86_64-unknown-linux-gnu.tar.gz',
    );
    expect(lin!.source).toEqual({
      kind: 'url',
      url: expect.stringContaining('linux-gnu.tar.gz'),
    });
    expect(lin!.integrity).toEqual({ sha256: 'abc123' });
    expect(lin!.size).toBe(123);
    expect(lin!.rules).toEqual([
      { action: 'allow', os: { name: 'linux' } },
      { action: 'allow', os: { arch: 'x86_64' } },
    ]);
    expect(lin!.extract).toEqual([
      { kind: 'pick', file: 'dgpuj', into: '${dgpuj_dir}/dgpuj' },
    ]);
    expect(win!.extract).toEqual([
      { kind: 'pick', file: 'dgpuj.exe', into: '${dgpuj_dir}/dgpuj.exe' },
    ]);
  });

  it('emits dgpuj_dir and per-OS dgpuj_bin arms', async () => {
    stubReleases([
      'dgpuj-x86_64-unknown-linux-gnu.tar.gz',
      'dgpuj-x86_64-pc-windows-msvc.zip',
    ]);
    const { vars } = await resolveDgpuj({ platforms: [LINUX_X64, WIN_X64] });
    expect(vars.dgpuj_dir).toBe('${root}/dgpuj');
    expect(vars.dgpuj_bin).toEqual([
      {
        value: '${dgpuj_dir}/dgpuj',
        rules: [{ action: 'allow', os: { name: 'linux' } }],
      },
      {
        value: '${dgpuj_dir}/dgpuj.exe',
        rules: [{ action: 'allow', os: { name: 'windows' } }],
      },
    ]);
  });

  it('defaults to all published targets', async () => {
    stubReleases(DEFAULT_PLATFORMS.map((p) => `dgpuj-${p.target}.${p.ext}`));
    const { artifacts, release } = await resolveDgpuj();
    expect(artifacts).toHaveLength(DEFAULT_PLATFORMS.length);
    expect(release.tag_name).toBe('v0.3.0');
  });

  it('forwards repo + version to the GitHub query', async () => {
    const fn = vi.fn(
      async (_input: string | URL) =>
        new Response(
          JSON.stringify(
            releasesJson(['dgpuj-x86_64-unknown-linux-gnu.tar.gz']),
          ),
        ),
    );
    vi.stubGlobal('fetch', fn);
    await resolveDgpuj({
      platforms: [LINUX_X64],
      repo: 'me/fork',
      version: 'v0.3.0',
    });
    expect(String(fn.mock.calls[0]![0])).toContain('/repos/me/fork/releases');
  });

  it('throws when the release lacks a platform asset', async () => {
    stubReleases(['dgpuj-x86_64-pc-windows-msvc.zip']); // no linux asset
    await expect(resolveDgpuj({ platforms: [LINUX_X64] })).rejects.toThrow(
      /No matching asset/,
    );
  });
});
