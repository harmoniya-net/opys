import { describe, expect, it } from 'vitest';
import { gzipSync } from 'fflate';
import {
  readTar,
  readTarArchive,
  isTarPath,
  type TarFileEntry,
  type TarSymlinkEntry,
} from '../../lib/tar';
import { buildTar } from '../helpers/tar-fixture';

const text = (u: Uint8Array) => new TextDecoder().decode(u);

describe('isTarPath', () => {
  it('recognizes tar extensions', () => {
    expect(isTarPath('x.tar')).toBe(true);
    expect(isTarPath('x.tar.gz')).toBe(true);
    expect(isTarPath('x.tgz')).toBe(true);
  });

  it('rejects non-tar extensions', () => {
    expect(isTarPath('x.zip')).toBe(false);
    expect(isTarPath('x.jar')).toBe(false);
  });
});

describe('readTar', () => {
  it('reads regular file entries with content and mode', () => {
    const tar = buildTar([{ name: 'a.txt', content: 'hello', mode: 0o755 }]);
    const entries = [...readTar(tar)] as TarFileEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe('file');
    expect(entries[0]!.name).toBe('a.txt');
    expect(text(entries[0]!.content)).toBe('hello');
    expect(entries[0]!.mode & 0o777).toBe(0o755);
  });

  it('reads symlink entries', () => {
    const tar = buildTar([
      { name: 'link', typeflag: '2', linkname: 'target/file' },
    ]);
    const entries = [...readTar(tar)] as TarSymlinkEntry[];
    expect(entries[0]!.kind).toBe('symlink');
    expect(entries[0]!.linkTarget).toBe('target/file');
  });

  it('skips directory and pax-header entries', () => {
    const tar = buildTar([
      { name: 'dir/', typeflag: '5' },
      { name: 'pax', typeflag: 'x', content: 'junk' },
      { name: 'real.txt', content: 'kept' },
    ]);
    const entries = [...readTar(tar)];
    expect(entries.map((e) => e.name)).toEqual(['real.txt']);
  });

  it('joins the USTAR prefix with the name', () => {
    const tar = buildTar([
      { name: 'file.txt', content: 'x', prefix: 'deep/nested/path' },
    ]);
    expect([...readTar(tar)][0]!.name).toBe('deep/nested/path/file.txt');
  });

  it('stops at the end-of-archive zero block', () => {
    const tar = buildTar([{ name: 'a', content: '1' }]);
    expect([...readTar(tar)]).toHaveLength(1);
  });

  it('reads multiple entries in order', () => {
    const tar = buildTar([
      { name: 'a', content: 'one' },
      { name: 'b', content: 'two' },
    ]);
    expect([...readTar(tar)].map((e) => e.name)).toEqual(['a', 'b']);
  });
});

describe('readTarArchive', () => {
  it('reads a plain .tar archive', () => {
    const tar = buildTar([{ name: 'a.txt', content: 'plain' }]);
    const entries = readTarArchive('x.tar', tar) as TarFileEntry[];
    expect(text(entries[0]!.content)).toBe('plain');
  });

  it('decompresses a .tar.gz archive', () => {
    const gz = gzipSync(buildTar([{ name: 'a.txt', content: 'zipped' }]));
    const entries = readTarArchive('x.tar.gz', gz) as TarFileEntry[];
    expect(text(entries[0]!.content)).toBe('zipped');
  });

  it('decompresses a .tgz archive', () => {
    const gz = gzipSync(buildTar([{ name: 'a.txt', content: 'tgz' }]));
    const entries = readTarArchive('x.tgz', gz) as TarFileEntry[];
    expect(text(entries[0]!.content)).toBe('tgz');
  });
});
