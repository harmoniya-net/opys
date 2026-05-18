import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  lstat,
  mkdtemp,
  readFile,
  readlink,
  rm,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import {
  matchesGlob,
  extractArchive,
  extractArchivePick,
} from '../../lib/archive';
import { buildTar } from '../helpers/tar-fixture';

const enc = new TextEncoder();
const dec = new TextDecoder();

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'torba-zip-'));
});
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

/** Write a zip archive of `{ name: text }` to disk and return its path. */
const makeZip = async (
  files: Record<string, string>,
  name = 'a.zip',
): Promise<string> => {
  const data = zipSync(
    Object.fromEntries(
      Object.entries(files).map(([k, v]) => [k, enc.encode(v)]),
    ),
  );
  const path = join(dir, name);
  await writeFile(path, data);
  return path;
};

const makeTar = async (
  entries: Parameters<typeof buildTar>[0],
  name = 'a.tar',
): Promise<string> => {
  const path = join(dir, name);
  await writeFile(path, buildTar(entries));
  return path;
};

describe('matchesGlob', () => {
  it('matches a directory prefix pattern ending in /*', () => {
    expect(matchesGlob('bin/java', 'bin/*')).toBe(true);
    expect(matchesGlob('lib/x', 'bin/*')).toBe(false);
  });

  it('matches a directory prefix pattern ending in /', () => {
    expect(matchesGlob('bin/java', 'bin/')).toBe(true);
  });

  it('matches a trailing-star prefix pattern', () => {
    expect(matchesGlob('libjvm.so', 'lib*')).toBe(true);
    expect(matchesGlob('java', 'lib*')).toBe(false);
  });

  it('matches a leading-star suffix pattern', () => {
    expect(matchesGlob('foo/bar.so', '*.so')).toBe(true);
    expect(matchesGlob('foo/bar.dll', '*.so')).toBe(false);
  });

  it('matches an exact name', () => {
    expect(matchesGlob('exact', 'exact')).toBe(true);
    expect(matchesGlob('other', 'exact')).toBe(false);
  });
});

describe('extractArchive', () => {
  it('extracts every file from a zip', async () => {
    const zip = await makeZip({ 'a.txt': 'A', 'sub/b.txt': 'B' });
    const out = join(dir, 'out');
    await extractArchive(zip, out, undefined, undefined);
    expect(dec.decode(await readFile(join(out, 'a.txt')))).toBe('A');
    expect(dec.decode(await readFile(join(out, 'sub/b.txt')))).toBe('B');
  });

  it('skips directory entries in a zip', async () => {
    const zip = await makeZip({ 'dir/': '', 'dir/f.txt': 'F' });
    const out = join(dir, 'out');
    await extractArchive(zip, out, undefined, undefined);
    expect(existsSync(join(out, 'dir/f.txt'))).toBe(true);
  });

  it('honors an includes filter', async () => {
    const zip = await makeZip({ 'keep.so': 'K', 'drop.txt': 'D' });
    const out = join(dir, 'out');
    await extractArchive(zip, out, ['*.so'], undefined);
    expect(existsSync(join(out, 'keep.so'))).toBe(true);
    expect(existsSync(join(out, 'drop.txt'))).toBe(false);
  });

  it('honors an excludes filter', async () => {
    const zip = await makeZip({ 'keep.txt': 'K', 'META-INF/x': 'M' });
    const out = join(dir, 'out');
    await extractArchive(zip, out, undefined, ['META-INF/']);
    expect(existsSync(join(out, 'keep.txt'))).toBe(true);
    expect(existsSync(join(out, 'META-INF/x'))).toBe(false);
  });

  it('strips a leading path prefix', async () => {
    const zip = await makeZip({ 'jdk-17/bin/java': 'J', 'other/x': 'O' });
    const out = join(dir, 'out');
    await extractArchive(zip, out, undefined, undefined, ['jdk-17/']);
    expect(existsSync(join(out, 'bin/java'))).toBe(true);
    expect(existsSync(join(out, 'other/x'))).toBe(true); // no prefix → kept
  });

  it('drops an entry whose name is entirely the stripped prefix', async () => {
    const zip = await makeZip({ 'jdk-17/': '', 'jdk-17/f': 'F' });
    const out = join(dir, 'out');
    await extractArchive(zip, out, undefined, undefined, ['jdk-17/']);
    expect(existsSync(join(out, 'f'))).toBe(true);
  });

  it('preserves the executable bit from a tar archive', async () => {
    const tar = await makeTar([
      { name: 'bin/java', content: 'ELF', mode: 0o755 },
    ]);
    const out = join(dir, 'out');
    await extractArchive(tar, out, undefined, undefined);
    const stat = await lstat(join(out, 'bin/java'));
    expect(stat.mode & 0o111).toBeTruthy();
  });

  it('writes symlink entries from a tar archive', async () => {
    const tar = await makeTar([
      { name: 'bin/java', content: 'real' },
      { name: 'bin/link', typeflag: '2', linkname: 'java' },
    ]);
    const out = join(dir, 'out');
    await extractArchive(tar, out, undefined, undefined);
    expect(await readlink(join(out, 'bin/link'))).toBe('java');
  });
});

describe('extractArchivePick', () => {
  it('extracts a single named file', async () => {
    const zip = await makeZip({ 'inner/data.json': '{"v":1}', other: 'x' });
    const dest = join(dir, 'picked.json');
    await extractArchivePick(zip, 'inner/data.json', dest);
    expect(dec.decode(await readFile(dest))).toBe('{"v":1}');
  });

  it('preserves the executable bit on a picked tar file', async () => {
    const tar = await makeTar([{ name: 'run.sh', content: '#!', mode: 0o755 }]);
    const dest = join(dir, 'run.sh');
    await extractArchivePick(tar, 'run.sh', dest);
    expect((await lstat(dest)).mode & 0o111).toBeTruthy();
  });

  it('throws when the named entry is absent', async () => {
    const zip = await makeZip({ 'a.txt': 'A' });
    await expect(
      extractArchivePick(zip, 'missing.txt', join(dir, 'out')),
    ).rejects.toThrow(/no file entry/);
  });

  it('throws when the named entry is not a file', async () => {
    const tar = await makeTar([
      { name: 'link', typeflag: '2', linkname: 'elsewhere' },
    ]);
    await expect(
      extractArchivePick(tar, 'link', join(dir, 'out')),
    ).rejects.toThrow(/no file entry/);
  });
});
