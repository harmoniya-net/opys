import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCleanroomVersion } from '../../lib/resolver';

afterEach(() => vi.unstubAllGlobals());

function asset(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    size: 1234,
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
    published_at?: string;
  } = {},
) {
  return {
    tag_name: tag,
    prerelease: opts.prerelease ?? false,
    draft: opts.draft ?? false,
    published_at: opts.published_at ?? '2024-01-01T00:00:00Z',
    assets: opts.assets ?? [asset(`cleanroom-${tag}-installer.jar`)],
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

describe('resolveCleanroomVersion', () => {
  it('resolves an exact tag', async () => {
    mockReleases([release('0.5.9-alpha', { prerelease: true })]);
    const r = await resolveCleanroomVersion('0.5.9-alpha');
    expect(r.tag).toBe('0.5.9-alpha');
    expect(r.installerName).toBe('cleanroom-0.5.9-alpha-installer.jar');
    expect(r.installerUrl).toContain('cleanroom-0.5.9-alpha-installer.jar');
    expect(r.installerSize).toBe(1234);
  });

  it('extracts a sha256 digest when present', async () => {
    mockReleases([
      release('0.5.9-alpha', {
        prerelease: true,
        assets: [
          asset('cleanroom-0.5.9-alpha-installer.jar', {
            digest: 'sha256:abc123',
          }),
        ],
      }),
    ]);
    const r = await resolveCleanroomVersion('0.5.9-alpha');
    expect(r.installerSha256).toBe('abc123');
  });

  it('leaves sha256 undefined when no digest is published', async () => {
    mockReleases([release('0.5.9-alpha', { prerelease: true })]);
    const r = await resolveCleanroomVersion('0.5.9-alpha');
    expect(r.installerSha256).toBeUndefined();
  });

  it('resolves "prerelease" to the newest release', async () => {
    mockReleases([
      release('0.6.0-alpha', { prerelease: true }),
      release('0.5.9-alpha', { prerelease: true }),
    ]);
    const r = await resolveCleanroomVersion('prerelease');
    expect(r.tag).toBe('0.6.0-alpha');
  });

  it('resolves "latest" to the newest non-prerelease', async () => {
    mockReleases([
      release('0.6.0-alpha', { prerelease: true }),
      release('0.5.0', { prerelease: false }),
    ]);
    const r = await resolveCleanroomVersion('latest');
    expect(r.tag).toBe('0.5.0');
  });

  it('skips draft releases', async () => {
    mockReleases([
      release('0.6.0', { draft: true }),
      release('0.5.0', { prerelease: true }),
    ]);
    const r = await resolveCleanroomVersion('prerelease');
    expect(r.tag).toBe('0.5.0');
  });

  it('ignores -sources installer assets', async () => {
    mockReleases([
      release('0.5.9-alpha', {
        prerelease: true,
        assets: [
          asset('cleanroom-0.5.9-alpha-sources-installer.jar'),
          asset('cleanroom-0.5.9-alpha-installer.jar'),
        ],
      }),
    ]);
    const r = await resolveCleanroomVersion('0.5.9-alpha');
    expect(r.installerName).toBe('cleanroom-0.5.9-alpha-installer.jar');
  });

  it('drops releases with no installer asset', async () => {
    mockReleases([
      release('0.5.9-alpha', {
        prerelease: true,
        assets: [asset('cleanroom-0.5.9-alpha.jar')],
      }),
    ]);
    await expect(resolveCleanroomVersion('0.5.9-alpha')).rejects.toThrow(
      /not found/,
    );
  });

  it('throws when no stable release exists for "latest"', async () => {
    mockReleases([release('0.5.9-alpha', { prerelease: true })]);
    await expect(resolveCleanroomVersion('latest')).rejects.toThrow(
      /No stable Cleanroom release/,
    );
  });

  it('throws when no releases exist for "prerelease"', async () => {
    mockReleases([]);
    await expect(resolveCleanroomVersion('prerelease')).rejects.toThrow(
      /No Cleanroom releases/,
    );
  });

  it('throws for an unknown exact tag, listing available tags', async () => {
    mockReleases([release('0.5.9-alpha', { prerelease: true })]);
    await expect(resolveCleanroomVersion('9.9.9')).rejects.toThrow(
      /Available: 0\.5\.9-alpha/,
    );
  });

  it('truncates the available-tags list past five with an ellipsis', async () => {
    mockReleases(
      Array.from({ length: 7 }, (_, i) =>
        release(`0.${i}.0-alpha`, { prerelease: true }),
      ),
    );
    await expect(resolveCleanroomVersion('absent')).rejects.toThrow(/…/);
  });

  it('throws on a GitHub API error', async () => {
    mockReleases([], 403);
    await expect(resolveCleanroomVersion('latest')).rejects.toThrow(
      /GitHub API 403/,
    );
  });

  it('sends an Authorization header when a token is given', async () => {
    const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
    vi.stubGlobal('fetch', fn);
    await resolveCleanroomVersion('prerelease', { token: 'tok' }).catch(
      () => {},
    );
    const init = fn.mock.calls[0]![1] as { headers: Headers };
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('targets a custom repo when provided', async () => {
    const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
    vi.stubGlobal('fetch', fn);
    await resolveCleanroomVersion('prerelease', {
      repo: 'me/fork',
    }).catch(() => {});
    expect(fn.mock.calls[0]![0]).toContain('/repos/me/fork/releases');
  });
});
