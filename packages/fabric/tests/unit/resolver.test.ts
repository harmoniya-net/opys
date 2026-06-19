import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFabricVersion } from '../../lib/resolver';

afterEach(() => vi.unstubAllGlobals());

const META = 'https://meta.fabric.test';

const LOADER_BUILDS = [
  { loader: { version: '0.16.10', stable: false } },
  { loader: { version: '0.16.9', stable: true } },
  { loader: { version: '0.16.8', stable: true } },
];

function mockFetch(routes: Array<[match: string, body: unknown]>) {
  const fn = vi.fn(async (url: string) => {
    for (const [match, body] of routes) {
      if (url.includes(match)) {
        return body instanceof Response
          ? body.clone()
          : new Response(JSON.stringify(body));
      }
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('resolveFabricVersion', () => {
  it('builds the profile URL directly for a pinned loader without fetching', async () => {
    const fn = mockFetch([]);
    const r = await resolveFabricVersion('1.21.4', META, '0.16.10');
    expect(r.gameVersion).toBe('1.21.4');
    expect(r.loaderVersion).toBe('0.16.10');
    expect(r.profileUrl).toBe(
      `${META}/v2/versions/loader/1.21.4/0.16.10/profile/json`,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('selects the newest stable loader build when none is pinned', async () => {
    mockFetch([['/v2/versions/loader/1.21.4', LOADER_BUILDS]]);
    const r = await resolveFabricVersion('1.21.4', META);
    // 0.16.10 is newest but unstable; 0.16.9 is the newest stable.
    expect(r.loaderVersion).toBe('0.16.9');
    expect(r.profileUrl).toContain('/0.16.9/profile/json');
  });

  it('falls back to the newest build when no stable build exists', async () => {
    mockFetch([
      [
        '/v2/versions/loader/1.21.4',
        [
          { loader: { version: '0.17.0-beta', stable: false } },
          { loader: { version: '0.16.10', stable: false } },
        ],
      ],
    ]);
    const r = await resolveFabricVersion('1.21.4', META);
    expect(r.loaderVersion).toBe('0.17.0-beta');
  });

  it('strips trailing slashes from the meta base', async () => {
    const fn = mockFetch([['/v2/versions/loader/1.21.4', LOADER_BUILDS]]);
    await resolveFabricVersion('1.21.4', `${META}///`);
    expect(fn.mock.calls[0]![0]).toBe(`${META}/v2/versions/loader/1.21.4`);
  });

  it('throws when no loader build targets the game version', async () => {
    mockFetch([['/v2/versions/loader/9.9.9', []]]);
    await expect(resolveFabricVersion('9.9.9', META)).rejects.toThrow(
      /No Fabric loader build found for Minecraft '9.9.9'/,
    );
  });

  it('throws when the loader list fetch fails', async () => {
    mockFetch([
      [
        '/v2/versions/loader/1.21.4',
        new Response('forbidden', { status: 403 }),
      ],
    ]);
    await expect(resolveFabricVersion('1.21.4', META)).rejects.toThrow(/→ 403/);
  });
});
