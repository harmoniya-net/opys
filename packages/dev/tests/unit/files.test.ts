import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { files, type PublishedFiles } from '../../lib/files';
import type { BuildArtifact, BuildContext } from '../../lib/plugin';
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

const byPath = (a: BuildArtifact, b: BuildArtifact) =>
  a.path.localeCompare(b.path);

const run = async (opts: Omit<PublishedFiles, 'from'>) => {
  const plugin = files({ from: dir, ...opts });
  const result = await plugin.build(ctx);
  return (result.artifacts ?? []).sort(byPath);
};

describe('files', () => {
  it('scans files into url artifacts with a sha1 hash and size', async () => {
    await touch('a.txt', 'hello');
    const arts = await run({ url: (f) => `https://cdn/${f.rel}` });
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
    const arts = await run({
      url: (f) => `https://cdn/${f.rel}`,
      hash: 'sha256',
    });
    const sha256 = createHash('sha256').update('hello').digest('hex');
    expect(arts[0]!.integrity).toEqual({ sha256 });
  });

  it('with no url, each file is carried and says where it is', async () => {
    await touch('a.txt', 'hello');
    await touch('sub/b.txt', 'world');
    const plugin = files({
      from: dir,
      to: (f) => `\${root}/${f.rel}`,
    });
    const { artifacts } = await plugin.build(ctx);
    // No url to give, no hash to compute: the build names each file by its
    // content when it carries it. Already in path order: the crate sorts
    // what the filesystem lists.
    expect(artifacts).toEqual([
      { path: '${root}/a.txt', source: { file: join(dir, 'a.txt') } },
      { path: '${root}/sub/b.txt', source: { file: join(dir, 'sub/b.txt') } },
    ]);
  });

  it('with a url nothing is carried', async () => {
    await touch('a.txt', 'hello');
    const result = await files({
      from: dir,
      url: (f) => `https://cdn/${f.rel}`,
    }).build(ctx);
    expect(result.artifacts![0]!.source).toEqual({ url: 'https://cdn/a.txt' });
  });

  it('defaults the artifact path to the relative path', async () => {
    await touch('sub/a.txt', 'x');
    const arts = await run({ url: (f) => `https://cdn/${f.rel}` });
    expect(arts[0]!.path).toBe('sub/a.txt');
  });

  it('interpolates ${rel} ${dir} ${filename} in templates', async () => {
    await touch('mods/jei.jar', 'x');
    const arts = await run({
      url: (f) => `https://cdn/${f.dir}/${f.filename}`,
      to: (f) => `install/${f.rel}`,
    });
    expect(arts[0]!.path).toBe('install/mods/jei.jar');
    expect(arts[0]!.source).toEqual({
      url: 'https://cdn/mods/jei.jar',
    });
  });

  it('leaves an empty ${dir} for a root-level file', async () => {
    await touch('root.txt', 'x');
    const arts = await run({ url: (f) => `https://cdn/${f.dir}x` });
    expect(arts[0]!.source).toEqual({ url: 'https://cdn/x' });
  });

  it('accepts path and url as functions', async () => {
    await touch('a.txt', 'x');
    const arts = await run({
      url: (f) => `https://cdn/${f.filename}`,
      to: (f) => `out/${f.rel}`,
    });
    expect(arts[0]!.path).toBe('out/a.txt');
    expect(arts[0]!.source).toEqual({ url: 'https://cdn/a.txt' });
  });

  it('walks nested directories', async () => {
    await touch('a.txt', '1');
    await touch('sub/b.txt', '2');
    await touch('sub/deep/c.txt', '3');
    const arts = await run({ url: (f) => `https://cdn/${f.rel}` });
    expect(arts.map((a) => a.path)).toEqual([
      'a.txt',
      'sub/b.txt',
      'sub/deep/c.txt',
    ]);
  });

  it('is post-processed by chaining fluent methods on the returned plugin', async () => {
    await touch('keep.txt', '1');
    await touch('drop.txt', '2');
    const plugin = files({
      from: dir,
      url: (f) => `https://cdn/${f.rel}`,
    }).exclude('drop.txt');
    const result = await plugin.build(ctx);
    expect((result.artifacts ?? []).map((a) => a.path)).toEqual(['keep.txt']);
  });

  it('logs how many files it found', async () => {
    await touch('a.txt', '1');
    await run({ url: (f) => `https://cdn/${f.rel}` });
    expect(logs.some((l) => l.includes('found 1 file(s)'))).toBe(true);
    expect(logs.some((l) => l.includes('excluded'))).toBe(false);
  });

  it('produces no artifacts for an empty directory', async () => {
    expect(await run({ url: (f) => `https://cdn/${f.rel}` })).toEqual([]);
  });

  it('ignores entries that are neither files nor directories', async () => {
    await touch('real.txt', 'x');
    await symlink(join(dir, 'nowhere'), join(dir, 'dangling'));
    const arts = await run({ url: (f) => `https://cdn/${f.rel}` });
    expect(arts.map((a) => a.path)).toEqual(['real.txt']);
  });

  it('resolves a relative `from` against ctx.configDir', async () => {
    await touch('a.txt', 'hello');
    const plugin = files({
      from: basename(dir),
      url: (f) => `https://cdn/${f.rel}`,
    });
    const result = await plugin.build({
      log: (_scope, msg) => logs.push(msg),
      configDir: dirname(dir),
      mode: '',
    });
    expect((result.artifacts ?? []).map((a) => a.path)).toEqual(['a.txt']);
  });

  it('refuses a template string, which `to` and `url` once took', () => {
    expect(() =>
      // @ts-expect-error — a `.mjs` config has nothing to refuse it but this.
      files({ from: dir, to: '${root}/${rel}' }),
    ).toThrow(/`to` is a function of the file now/);
  });

  it('refuses a bare directory in place of its options', () => {
    // @ts-expect-error — as above.
    expect(() => files(dir)).toThrow(/takes one options object/);
  });
});

// The two shapes are told apart by `url`, and the type holds the line: a
// `hash` is a choice only a published file has.
// @ts-expect-error — `hash` without `url`
files({ from: 'x', hash: 'sha256' });
