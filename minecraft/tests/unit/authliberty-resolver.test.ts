import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthLibertyVersion } from '../../lib/authliberty/resolver';

afterEach(() => vi.unstubAllGlobals());

function pkg(version: string, extra: Record<string, unknown> = {}) {
  return {
    id: 100,
    name: 'authliberty',
    version,
    package_type: 'generic',
    status: 'default',
    created_at: '2024-01-01T00:00:00Z',
    ...extra,
  };
}

function file(name: string, extra: Record<string, unknown> = {}) {
  return {
    id: 1,
    package_id: 100,
    file_name: name,
    size: 4096,
    file_sha256: 'cafef00d',
    created_at: '2024-01-01T00:00:00Z',
    ...extra,
  };
}

/** Mock fetch: first call returns packages, subsequent calls return files. */
function mockApi(packages: unknown[], files: unknown[]) {
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes('/package_files')) {
      return new Response(JSON.stringify(files));
    }
    return new Response(JSON.stringify(packages));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('resolveAuthLibertyVersion', () => {
  it('resolves an exact version into a release with a download URL', async () => {
    mockApi([pkg('0.3')], [file('authliberty-0.3.jar')]);
    const r = await resolveAuthLibertyVersion('0.3');
    expect(r.version).toBe('0.3');
    expect(r.filename).toBe('authliberty-0.3.jar');
    expect(r.size).toBe(4096);
    expect(r.sha256).toBe('cafef00d');
    expect(r.url).toContain('/packages/generic/authliberty/0.3/');
  });

  it('leaves sha256 undefined when GitLab reports null', async () => {
    mockApi([pkg('0.3')], [file('authliberty-0.3.jar', { file_sha256: null })]);
    const r = await resolveAuthLibertyVersion('0.3');
    expect(r.sha256).toBeUndefined();
  });

  it('filters out non-generic / non-default / mismatched packages', async () => {
    mockApi(
      [
        pkg('0.3', { package_type: 'maven' }),
        pkg('0.3', { status: 'processing' }),
        pkg('0.3', { name: 'other' }),
        pkg('0.3'),
      ],
      [file('authliberty-0.3.jar')],
    );
    const r = await resolveAuthLibertyVersion('0.3');
    expect(r.version).toBe('0.3');
  });

  it('picks the most recently created package for a re-published version', async () => {
    mockApi(
      [
        pkg('0.3', { id: 1, created_at: '2024-01-01T00:00:00Z' }),
        pkg('0.3', { id: 2, created_at: '2024-06-01T00:00:00Z' }),
      ],
      [file('authliberty-0.3.jar')],
    );
    const fn = vi.mocked(globalThis.fetch);
    await resolveAuthLibertyVersion('0.3');
    // second call (package_files) must reference package id 2
    expect(fn.mock.calls[1]![0]).toContain('/packages/2/');
  });

  it('picks the most recently created jar file', async () => {
    mockApi(
      [pkg('0.3')],
      [
        file('authliberty-old.jar', { created_at: '2024-01-01T00:00:00Z' }),
        file('authliberty-new.jar', { created_at: '2024-09-01T00:00:00Z' }),
      ],
    );
    const r = await resolveAuthLibertyVersion('0.3');
    expect(r.filename).toBe('authliberty-new.jar');
  });

  it('throws when the version is not found, listing available versions', async () => {
    mockApi([pkg('0.3'), pkg('0.2')], []);
    await expect(resolveAuthLibertyVersion('9.9')).rejects.toThrow(
      /Available: 0\.3, 0\.2/,
    );
  });

  it('reports "(none)" when no packages exist at all', async () => {
    mockApi([], []);
    await expect(resolveAuthLibertyVersion('0.3')).rejects.toThrow(
      /Available: \(none\)/,
    );
  });

  it('throws when the package has no .jar file', async () => {
    mockApi([pkg('0.3')], [file('authliberty-0.3.txt')]);
    await expect(resolveAuthLibertyVersion('0.3')).rejects.toThrow(
      /has no \.jar file/,
    );
  });

  it('throws on a packages-API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('x', { status: 403 })),
    );
    await expect(resolveAuthLibertyVersion('0.3')).rejects.toThrow(
      /GitLab API 403/,
    );
  });

  it('throws on a package-files-API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/package_files')
          ? new Response('x', { status: 403 })
          : new Response(JSON.stringify([pkg('0.3')])),
      ),
    );
    await expect(resolveAuthLibertyVersion('0.3')).rejects.toThrow(
      /GitLab API 403/,
    );
  });

  it('sends a PRIVATE-TOKEN header when a token is given', async () => {
    const fn = mockApi([pkg('0.3')], [file('authliberty-0.3.jar')]);
    await resolveAuthLibertyVersion('0.3', { token: 'glpat-x' });
    const init = fn.mock.calls[0]![1] as { headers: Headers };
    expect(new Headers(init.headers).get('PRIVATE-TOKEN')).toBe('glpat-x');
  });

  it('honours a custom project and gitlab base, stripping trailing slashes', async () => {
    const fn = mockApi([pkg('0.3')], [file('authliberty-0.3.jar')]);
    await resolveAuthLibertyVersion('0.3', {
      project: 'group/sub/proj',
      gitlab: 'https://git.example.com///',
    });
    const url = fn.mock.calls[0]![0] as string;
    expect(url.startsWith('https://git.example.com/api/v4/')).toBe(true);
    expect(url).toContain(encodeURIComponent('group/sub/proj'));
  });
});
