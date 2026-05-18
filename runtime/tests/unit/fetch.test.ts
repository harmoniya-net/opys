import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  sourceUrl,
  sourceFile,
  sourceString,
  sourceBytes,
  sourcePointer,
  type Artifact,
} from '@torba/core';
import { fetchAll, type FetchTask } from '../../lib/phases/fetch';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'torba-fetch-'));
});
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const task = (artifact: Artifact, name: string): FetchTask => ({
  artifact,
  finalPath: join(dir, name),
});

const art = (source: Artifact['source'], size?: number): Artifact => ({
  path: 'a',
  source,
  rules: [],
  ...(size !== undefined ? { size } : {}),
});

describe('fetchAll', () => {
  it('writes a string source to the final path', async () => {
    const t = task(art(sourceString('hello')), 'out.txt');
    await fetchAll([t], {}, 4);
    expect(await readFile(t.finalPath, 'utf8')).toBe('hello');
  });

  it('writes a bytes source decoded from base64', async () => {
    const t = task(art(sourceBytes(new Uint8Array([1, 2, 3]))), 'out.bin');
    await fetchAll([t], {}, 4);
    expect([...(await readFile(t.finalPath))]).toEqual([1, 2, 3]);
  });

  it('copies a file source', async () => {
    const src = join(dir, 'src.txt');
    await writeFile(src, 'file-source');
    const t = task(art(sourceFile(src)), 'copied.txt');
    await fetchAll([t], {}, 4);
    expect(await readFile(t.finalPath, 'utf8')).toBe('file-source');
  });

  it('interpolates ${var} in a file source path', async () => {
    const src = join(dir, 'src.txt');
    await writeFile(src, 'interp');
    const t = task(art(sourceFile('${base}/src.txt')), 'copied.txt');
    await fetchAll([t], { base: dir }, 4);
    expect(await readFile(t.finalPath, 'utf8')).toBe('interp');
  });

  it('downloads a url source and reports hooks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('downloaded')),
    );
    const t = task(art(sourceUrl('https://h/a'), 10), 'dl.txt');
    const events: string[] = [];
    await fetchAll([t], {}, 4, {
      onStart: () => events.push('start'),
      onBytes: () => events.push('bytes'),
      onDone: () => events.push('done'),
    });
    expect(await readFile(t.finalPath, 'utf8')).toBe('downloaded');
    expect(events[0]).toBe('start');
    expect(events).toContain('bytes');
    expect(events.at(-1)).toBe('done');
  });

  it('interpolates ${var} in a url source', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const t = task(art(sourceUrl('https://h/${name}')), 'dl.txt');
    await fetchAll([t], { name: 'file.jar' }, 4);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://h/file.jar');
  });

  it('writes an empty file when the url response has no body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)));
    const t = task(art(sourceUrl('https://h/a')), 'empty.txt');
    await fetchAll([t], {}, 4);
    expect(await readFile(t.finalPath, 'utf8')).toBe('');
  });

  it('sends a torba User-Agent on url downloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('x'));
    vi.stubGlobal('fetch', fetchMock);
    await fetchAll([task(art(sourceUrl('https://h/a')), 'a')], {}, 4);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('user-agent')).toMatch(/^torba\//);
  });

  it('downloads many artifacts of mixed size within a budget', async () => {
    const MB = 1024 * 1024;
    const tasks = [
      task(art(sourceString('huge'), 60 * MB), 'huge.txt'),
      task(art(sourceString('large'), 20 * MB), 'large.txt'),
      task(art(sourceString('medium'), 5 * MB), 'medium.txt'),
      task(art(sourceString('small'), 100), 'small.txt'),
      task(art(sourceString('unknown')), 'unknown.txt'),
    ];
    await fetchAll(tasks, {}, 8);
    for (const t of tasks) expect(existsSync(t.finalPath)).toBe(true);
  });

  it('retries a transient download failure then succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValueOnce(new Response('recovered')),
    );
    const t = task(art(sourceUrl('https://h/a')), 'retry.txt');
    await fetchAll([t], {}, 4);
    expect(await readFile(t.finalPath, 'utf8')).toBe('recovered');
  });

  // The retry backoff (0.5s + 2s + 8s) makes the exhaustion path slow; the
  // generous timeout is intentional rather than mocking module internals.
  it('throws and cleans the partial file after exhausting retries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('always fails')),
    );
    const t = task(art(sourceUrl('https://h/a')), 'fail.txt');
    await expect(fetchAll([t], {}, 4)).rejects.toThrow('always fails');
    expect(existsSync(`${t.finalPath}.partial`)).toBe(false);
  }, 20_000);

  it('rejects an unsupported (pointer) source', async () => {
    const t = task(art(sourcePointer('https://h/p.json')), 'p.txt');
    await expect(fetchAll([t], {}, 4)).rejects.toThrow(/Unsupported source/);
  }, 20_000);
});
