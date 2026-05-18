import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLwjgl3ifyVersion } from '../../lib/lwjgl3ify/resolver';

afterEach(() => vi.unstubAllGlobals());

function asset(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    size: 555,
    browser_download_url: `https://gh/dl/${name}`,
    ...extra,
  };
}

function release(
  tag: string,
  opts: {
    prerelease?: boolean;
    draft?: boolean;
    assets?: unknown[];
  } = {},
) {
  return {
    tag_name: tag,
    prerelease: opts.prerelease ?? false,
    draft: opts.draft ?? false,
    published_at: '2024-06-01T00:00:00Z',
    assets: opts.assets ?? [
      asset('version.json'),
      asset(`lwjgl3ify-${tag}.jar`),
    ],
  };
}

function mockReleases(releases: unknown[], status = 200) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(releases), { status })),
  );
}

describe('resolveLwjgl3ifyVersion', () => {
  it('resolves an exact tag with version.json and mod jar', async () => {
    mockReleases([release('3.0.16')]);
    const r = await resolveLwjgl3ifyVersion('3.0.16');
    expect(r.tag).toBe('3.0.16');
    expect(r.versionJson.name).toBe('version.json');
    expect(r.modJar.name).toBe('lwjgl3ify-3.0.16.jar');
  });

  it('extracts a sha256 digest from assets when present', async () => {
    mockReleases([
      release('3.0.16', {
        assets: [
          asset('version.json', { digest: 'sha256:vvv' }),
          asset('lwjgl3ify-3.0.16.jar', { digest: 'sha256:mmm' }),
        ],
      }),
    ]);
    const r = await resolveLwjgl3ifyVersion('3.0.16');
    expect(r.versionJson.sha256).toBe('vvv');
    expect(r.modJar.sha256).toBe('mmm');
  });

  it('resolves "latest" to the newest stable release', async () => {
    mockReleases([
      release('3.1.0', { prerelease: true }),
      release('3.0.16', { prerelease: false }),
    ]);
    const r = await resolveLwjgl3ifyVersion('latest');
    expect(r.tag).toBe('3.0.16');
  });

  it('resolves "prerelease" to the newest release', async () => {
    mockReleases([release('3.1.0', { prerelease: true }), release('3.0.16')]);
    const r = await resolveLwjgl3ifyVersion('prerelease');
    expect(r.tag).toBe('3.1.0');
  });

  it('skips drafts', async () => {
    mockReleases([release('3.2.0', { draft: true }), release('3.0.16')]);
    const r = await resolveLwjgl3ifyVersion('prerelease');
    expect(r.tag).toBe('3.0.16');
  });

  it('drops releases missing a version.json asset', async () => {
    mockReleases([
      release('3.0.16', { assets: [asset('lwjgl3ify-3.0.16.jar')] }),
    ]);
    await expect(resolveLwjgl3ifyVersion('3.0.16')).rejects.toThrow(
      /not found/,
    );
  });

  it('drops releases missing the plain mod jar', async () => {
    mockReleases([
      release('3.0.16', {
        assets: [asset('version.json'), asset('lwjgl3ify-3.0.16-dev.jar')],
      }),
    ]);
    await expect(resolveLwjgl3ifyVersion('3.0.16')).rejects.toThrow(
      /not found/,
    );
  });

  it('throws when no stable release exists for "latest"', async () => {
    mockReleases([release('3.1.0', { prerelease: true })]);
    await expect(resolveLwjgl3ifyVersion('latest')).rejects.toThrow(
      /No stable lwjgl3ify release/,
    );
  });

  it('throws when no usable release exists for "prerelease"', async () => {
    mockReleases([]);
    await expect(resolveLwjgl3ifyVersion('prerelease')).rejects.toThrow(
      /No lwjgl3ify release/,
    );
  });

  it('throws for an unknown tag listing available ones', async () => {
    mockReleases([release('3.0.16')]);
    await expect(resolveLwjgl3ifyVersion('9.9.9')).rejects.toThrow(
      /Available: 3\.0\.16/,
    );
  });

  it('truncates the available list past five', async () => {
    mockReleases(Array.from({ length: 7 }, (_, i) => release(`3.0.${i}`)));
    await expect(resolveLwjgl3ifyVersion('absent')).rejects.toThrow(/…/);
  });

  it('throws on a GitHub API error', async () => {
    mockReleases([], 403);
    await expect(resolveLwjgl3ifyVersion('latest')).rejects.toThrow(
      /GitHub API 403/,
    );
  });

  it('sends an Authorization header with a token', async () => {
    const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
    vi.stubGlobal('fetch', fn);
    await resolveLwjgl3ifyVersion('prerelease', { token: 't' }).catch(() => {});
    const init = fn.mock.calls[0]![1] as { headers: Headers };
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer t');
  });

  it('targets a custom repo', async () => {
    const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
    vi.stubGlobal('fetch', fn);
    await resolveLwjgl3ifyVersion('prerelease', {
      repo: 'me/fork',
    }).catch(() => {});
    expect(fn.mock.calls[0]![0]).toContain('/repos/me/fork/releases');
  });
});
