import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { artifactScanner, type UrlScannerOptions } from '../../lib/scanner';
import type { BuildContext } from '../../lib/plugin';
import type { Artifact } from '@opys/core';

let dir = '';
const logs: string[] = [];
const ctx: BuildContext = {
  log: (_scope, msg) => logs.push(msg),
  configDir: '/tmp',
  mode: '',
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'opys-scan-'));
  logs.length = 0;
});

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const touch = async (rel: string, body: string) => {
  const abs = join(dir, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body);
};

const byPath = (a: Artifact, b: Artifact) => a.path.localeCompare(b.path);

const run = async (opts: Omit<UrlScannerOptions, 'directory'>) => {
  const plugin = artifactScanner({ directory: dir, ...opts });
  const result = await plugin.build(ctx);
  return (result.artifacts ?? []).sort(byPath);
};

describe('artifactScanner', () => {
  it('scans files into url artifacts with a sha1 hash and size', async () => {
    await touch('a.txt', 'hello');
    const arts = await run({ url: 'https://cdn/${rel}' });
    expect(arts).toHaveLength(1);
    const a = arts[0]!;
    expect(a.path).toBe('a.txt');
    expect(a.source).toEqual({ url: 'https://cdn/a.txt' });
    expect(a.size).toBe(5);
    const sha1 = createHash('sha1').update('hello').digest('hex');
    expect(a.integrity).toEqual({ sha1 });
  });

  it('emits sha256 integrity when requested', async () => {
    await touch('a.txt', 'hello');
    const arts = await run({ url: 'https://cdn/${rel}', hash: 'sha256' });
    const sha256 = createHash('sha256').update('hello').digest('hex');
    expect(arts[0]!.integrity).toEqual({ sha256 });
  });

  it('in blob mode, each file is a blob and the table says where it is', async () => {
    await touch('a.txt', 'hello');
    await touch('sub/b.txt', 'world');
    const plugin = artifactScanner({
      directory: dir,
      source: 'blob',
      path: '${root}/${rel}',
    });
    const { artifacts, blobs } = await plugin.build(ctx);
    const hello = createHash('sha256').update('hello').digest('hex');
    const world = createHash('sha256').update('world').digest('hex');
    // No url to give and no integrity to choose: the blob's name is its hash.
    expect([...artifacts!].sort(byPath)).toEqual([
      { path: '${root}/a.txt', source: { blob: hello }, size: 5, rules: [] },
      {
        path: '${root}/sub/b.txt',
        source: { blob: world },
        size: 5,
        rules: [],
      },
    ]);
    expect(blobs).toEqual({
      [hello]: { file: join(dir, 'a.txt') },
      [world]: { file: join(dir, 'sub/b.txt') },
    });
  });

  it('in blob mode, two files with the same content are one blob', async () => {
    await touch('a.txt', 'same');
    await touch('b.txt', 'same');
    const { artifacts, blobs } = await artifactScanner({
      directory: dir,
      source: 'blob',
    }).build(ctx);
    expect(artifacts).toHaveLength(2);
    expect(Object.keys(blobs!)).toHaveLength(1);
  });

  it('in url mode there are no blobs to carry', async () => {
    await touch('a.txt', 'hello');
    const result = await artifactScanner({
      directory: dir,
      url: 'https://cdn/${rel}',
    }).build(ctx);
    expect(result.blobs).toEqual({});
  });

  it('defaults the artifact path to the relative path', async () => {
    await touch('sub/a.txt', 'x');
    const arts = await run({ url: 'https://cdn/${rel}' });
    expect(arts[0]!.path).toBe('sub/a.txt');
  });

  it('interpolates ${rel} ${dir} ${filename} in templates', async () => {
    await touch('mods/jei.jar', 'x');
    const arts = await run({
      url: 'https://cdn/${dir}/${filename}',
      path: 'install/${rel}',
    });
    expect(arts[0]!.path).toBe('install/mods/jei.jar');
    expect(arts[0]!.source).toEqual({
      url: 'https://cdn/mods/jei.jar',
    });
  });

  it('leaves an empty ${dir} for a root-level file', async () => {
    await touch('root.txt', 'x');
    const arts = await run({ url: 'https://cdn/${dir}x' });
    expect(arts[0]!.source).toEqual({ url: 'https://cdn/x' });
  });

  it('accepts path and url as functions', async () => {
    await touch('a.txt', 'x');
    const arts = await run({
      url: (f) => `https://cdn/${f.filename}`,
      path: (f) => `out/${f.rel}`,
    });
    expect(arts[0]!.path).toBe('out/a.txt');
    expect(arts[0]!.source).toEqual({ url: 'https://cdn/a.txt' });
  });

  it('walks nested directories', async () => {
    await touch('a.txt', '1');
    await touch('sub/b.txt', '2');
    await touch('sub/deep/c.txt', '3');
    const arts = await run({ url: 'https://cdn/${rel}' });
    expect(arts.map((a) => a.path)).toEqual([
      'a.txt',
      'sub/b.txt',
      'sub/deep/c.txt',
    ]);
  });

  it('is post-processed by chaining fluent methods on the returned plugin', async () => {
    await touch('keep.txt', '1');
    await touch('drop.txt', '2');
    const plugin = artifactScanner({
      directory: dir,
      url: 'https://cdn/${rel}',
    }).exclude('drop.txt');
    const result = await plugin.build(ctx);
    expect((result.artifacts ?? []).map((a) => a.path)).toEqual(['keep.txt']);
  });

  it('logs the scanned count with no exclusions', async () => {
    await touch('a.txt', '1');
    await run({ url: 'https://cdn/${rel}' });
    expect(logs.some((l) => l.includes('scanned 1 file(s)'))).toBe(true);
    expect(logs.some((l) => l.includes('excluded'))).toBe(false);
  });

  it('produces no artifacts for an empty directory', async () => {
    expect(await run({ url: 'https://cdn/${rel}' })).toEqual([]);
  });

  it('ignores entries that are neither files nor directories', async () => {
    await touch('real.txt', 'x');
    await symlink(join(dir, 'nowhere'), join(dir, 'dangling'));
    const arts = await run({ url: 'https://cdn/${rel}' });
    expect(arts.map((a) => a.path)).toEqual(['real.txt']);
  });

  it('resolves a relative directory against ctx.configDir', async () => {
    await touch('a.txt', 'hello');
    const plugin = artifactScanner({
      directory: basename(dir),
      url: 'https://cdn/${rel}',
    });
    const result = await plugin.build({
      log: (_scope, msg) => logs.push(msg),
      configDir: dirname(dir),
      mode: '',
    });
    expect((result.artifacts ?? []).map((a) => a.path)).toEqual(['a.txt']);
  });
});
