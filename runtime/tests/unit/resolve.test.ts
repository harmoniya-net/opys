import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeManifest, type Manifest } from '@torba/core';
import { resolveManifest } from '../../lib/phases/resolve';
import { NetworkError } from '../../lib/errors';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'torba-resolve-'));
});
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

const manifest: Manifest = { vars: { root: '.' }, artifacts: [] };

describe('resolveManifest', () => {
  it('passes a Manifest object straight through', async () => {
    expect(await resolveManifest(manifest)).toBe(manifest);
  });

  it('reads and parses a manifest from a file path', async () => {
    const path = join(dir, 'torba.json');
    await writeFile(path, JSON.stringify(encodeManifest(manifest)));
    const result = await resolveManifest(path);
    expect(result.vars).toEqual({ root: '.' });
  });

  it('fetches and parses a manifest from a URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(encodeManifest(manifest))),
        ),
    );
    const result = await resolveManifest(new URL('https://h/torba.json'));
    expect(result.vars).toEqual({ root: '.' });
  });

  it('sends a User-Agent header when fetching by URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(encodeManifest(manifest))),
      );
    vi.stubGlobal('fetch', fetchMock);
    await resolveManifest(new URL('https://h/torba.json'));
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('user-agent')).toMatch(/^torba\//);
  });

  it('throws NetworkError on an HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 404 })),
    );
    await expect(
      resolveManifest(new URL('https://h/torba.json')),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('rejects an unparseable manifest file', async () => {
    const path = join(dir, 'bad.json');
    await writeFile(path, 'not json');
    await expect(resolveManifest(path)).rejects.toThrow();
  });
});
