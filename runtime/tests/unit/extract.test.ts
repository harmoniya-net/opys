import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zipSync, strToU8, gzipSync } from 'fflate';
import {
  sourceFile,
  extractDump,
  extractScan,
  extractPick,
  type Artifact,
  type Manifest,
} from '@torba/core';
import { install } from '../../lib/install';
import { extractAll, EXTRACT_MARKER_SUFFIX } from '../../lib/phases/extract';
import { ExtractionError } from '../../lib/errors';

function makeTarGz(
  files: Array<{ name: string; content: string; mode?: number }>,
): Uint8Array {
  const enc = (s: string) => new TextEncoder().encode(s);
  const setStr = (
    b: Uint8Array,
    off: number,
    str: string,
    max: number,
  ): void => {
    const v = enc(str);
    for (let i = 0; i < Math.min(v.length, max); i++) b[off + i] = v[i]!;
  };
  const setOctal = (
    b: Uint8Array,
    off: number,
    n: number,
    len: number,
  ): void => {
    const s = n.toString(8).padStart(len - 1, '0') + '\0';
    for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
  };
  const setChecksum = (b: Uint8Array): void => {
    for (let i = 0; i < 8; i++) b[148 + i] = 0x20;
    let sum = 0;
    for (const x of b) sum += x;
    setOctal(b, 148, sum, 8);
  };
  const blocks: Uint8Array[] = [];
  for (const { name, content, mode = 0o644 } of files) {
    const data = enc(content);
    const header = new Uint8Array(512);
    setStr(header, 0, name, 100);
    setOctal(header, 100, mode, 8);
    setOctal(header, 124, data.length, 12);
    header[156] = 0x30; // '0' regular file
    setStr(header, 257, 'ustar\0', 6);
    setStr(header, 263, '00', 2);
    setChecksum(header);
    blocks.push(header);
    const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
    padded.set(data);
    blocks.push(padded);
  }
  blocks.push(new Uint8Array(1024));
  const total = blocks.reduce((acc, b) => acc + b.length, 0);
  const tar = new Uint8Array(total);
  let off = 0;
  for (const b of blocks) {
    tar.set(b, off);
    off += b.length;
  }
  return gzipSync(tar);
}

function makeZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = strToU8(content);
  }
  return zipSync(entries);
}

function makeManifest(artifacts: Artifact[]): Manifest {
  return { vars: {}, artifacts };
}

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'unipack-extract-test-'));
});
afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('ExtractDump runtime', () => {
  it('dumps all zip entries into target dir', async () => {
    const zip = makeZip({ 'a.txt': 'hello', 'sub/b.txt': 'world' });
    const sourceZip = join(tmpDir, 'source.zip');
    const artifactPath = join(tmpDir, 'archive.zip');
    await writeFile(sourceZip, zip);
    const targetDir = join(tmpDir, 'out');

    const artifact: Artifact = {
      path: artifactPath,
      source: sourceFile(sourceZip),

      rules: [],

      extract: [extractDump(targetDir)],
    };

    await install(makeManifest([artifact]));
    expect(existsSync(join(targetDir, 'a.txt'))).toBe(true);
    expect(await readFile(join(targetDir, 'a.txt'), 'utf8')).toBe('hello');
    expect(existsSync(join(targetDir, 'sub/b.txt'))).toBe(true);
  });

  it('respects excludes', async () => {
    const zip = makeZip({
      'keep.txt': 'keep',
      'META-INF/MANIFEST.MF': 'manifest',
    });
    const sourceZip = join(tmpDir, 'source.zip');
    const artifactPath = join(tmpDir, 'archive.zip');
    await writeFile(sourceZip, zip);
    const targetDir = join(tmpDir, 'out');

    const artifact: Artifact = {
      path: artifactPath,
      source: sourceFile(sourceZip),

      rules: [],

      extract: [extractDump(targetDir, { excludes: ['META-INF/'] })],
    };

    await install(makeManifest([artifact]));
    expect(existsSync(join(targetDir, 'keep.txt'))).toBe(true);
    expect(existsSync(join(targetDir, 'META-INF/MANIFEST.MF'))).toBe(false);
  });

  it('respects includes', async () => {
    const zip = makeZip({ 'foo.so': 'native', 'readme.txt': 'docs' });
    const sourceZip = join(tmpDir, 'source.zip');
    const artifactPath = join(tmpDir, 'archive.zip');
    await writeFile(sourceZip, zip);
    const targetDir = join(tmpDir, 'out');

    const artifact: Artifact = {
      path: artifactPath,
      source: sourceFile(sourceZip),

      rules: [],

      extract: [extractDump(targetDir, { includes: ['*.so'] })],
    };

    await install(makeManifest([artifact]));
    expect(existsSync(join(targetDir, 'foo.so'))).toBe(true);
    expect(existsSync(join(targetDir, 'readme.txt'))).toBe(false);
  });

  it('clean wipes target dir before extraction', async () => {
    const targetDir = join(tmpDir, 'natives');
    const { mkdir, writeFile: wf } = await import('node:fs/promises');
    await mkdir(targetDir, { recursive: true });
    await wf(join(targetDir, 'stale.so'), 'old');

    const zip = makeZip({ 'fresh.so': 'new' });
    const sourceZip = join(tmpDir, 'source.zip');
    const artifactPath = join(tmpDir, 'archive.zip');
    await writeFile(sourceZip, zip);

    const artifact: Artifact = {
      path: artifactPath,
      source: sourceFile(sourceZip),

      rules: [],

      extract: [extractDump(targetDir, { clean: true })],
    };

    await install(makeManifest([artifact]));
    expect(existsSync(join(targetDir, 'stale.so'))).toBe(false);
    expect(existsSync(join(targetDir, 'fresh.so'))).toBe(true);
  });

  it('skips extraction when artifact AND extract destination are both cached', async () => {
    const zip = makeZip({ 'file.txt': 'fresh' });
    const artifactPath = join(tmpDir, 'archive.zip');
    await writeFile(artifactPath, zip);
    const targetDir = join(tmpDir, 'out');
    // Pre-existing extract output: the install must NOT overwrite it.
    const { mkdir, writeFile: wf } = await import('node:fs/promises');
    await mkdir(targetDir, { recursive: true });
    await wf(join(targetDir, 'file.txt'), 'previous');

    const artifact: Artifact = {
      path: artifactPath,
      source: sourceFile(artifactPath),

      rules: [],

      extract: [extractDump(targetDir)],
    };

    await install(makeManifest([artifact]));
    expect(await readFile(join(targetDir, 'file.txt'), 'utf8')).toBe(
      'previous',
    );
  });

  it('extracts a tar.gz archive into target dir', async () => {
    const tar = makeTarGz([
      { name: 'a.txt', content: 'hello' },
      { name: 'sub/b.txt', content: 'nested' },
      { name: 'bin/run', content: '#!/bin/sh\necho hi\n', mode: 0o755 },
    ]);
    const sourceTar = join(tmpDir, 'source.tar.gz');
    const artifactPath = join(tmpDir, 'archive.tar.gz');
    await writeFile(sourceTar, tar);
    const targetDir = join(tmpDir, 'out');

    const artifact: Artifact = {
      path: artifactPath,
      source: sourceFile(sourceTar),
      rules: [],
      extract: [extractDump(targetDir, { excludes: [] })],
    };

    await install(makeManifest([artifact]));
    expect(await readFile(join(targetDir, 'a.txt'), 'utf8')).toBe('hello');
    expect(await readFile(join(targetDir, 'sub/b.txt'), 'utf8')).toBe('nested');
    // Mode bit on bin/run preserved
    expect(statSync(join(targetDir, 'bin/run')).mode & 0o111).not.toBe(0);
  });

  it('re-extracts when source is cached but destination is missing', async () => {
    const zip = makeZip({ 'file.txt': 'content' });
    const artifactPath = join(tmpDir, 'archive.zip');
    await writeFile(artifactPath, zip);
    const targetDir = join(tmpDir, 'out');

    const artifact: Artifact = {
      path: artifactPath,
      source: sourceFile(artifactPath),

      rules: [],

      extract: [extractDump(targetDir)],
    };

    await install(makeManifest([artifact]));
    // extractIsPending kicked in: dest was missing so install re-extracted.
    expect(existsSync(join(targetDir, 'file.txt'))).toBe(true);
  });
});

describe('extractAll', () => {
  it('handles a pick rule, copying a single entry out', async () => {
    const archive = join(tmpDir, 'a.zip');
    await writeFile(archive, makeZip({ 'inner/config.json': '{"ok":1}' }));
    const dest = join(tmpDir, 'config.json');
    await extractAll(
      [
        {
          finalPath: archive,
          artifact: {
            path: archive,
            source: sourceFile(archive),
            rules: [],
            extract: [extractPick('inner/config.json', dest)],
          },
        },
      ],
      {},
    );
    expect(await readFile(dest, 'utf8')).toBe('{"ok":1}');
    expect(existsSync(`${archive}${EXTRACT_MARKER_SUFFIX}`)).toBe(true);
  });

  it('handles a scan rule with a strip prefix', async () => {
    const archive = join(tmpDir, 'a.zip');
    await writeFile(
      archive,
      makeZip({ 'jdk/lib/x.so': 'NATIVE', 'jdk/readme.txt': 'docs' }),
    );
    const out = join(tmpDir, 'natives');
    await extractAll(
      [
        {
          finalPath: archive,
          artifact: {
            path: archive,
            source: sourceFile(archive),
            rules: [],
            extract: [extractScan('jdk/lib/*', out, { strip: ['jdk/lib/'] })],
          },
        },
      ],
      {},
    );
    expect(existsSync(join(out, 'x.so'))).toBe(true);
    expect(existsSync(join(out, 'readme.txt'))).toBe(false);
  });

  it('interpolates ${var} in rule destinations', async () => {
    const archive = join(tmpDir, 'a.zip');
    await writeFile(archive, makeZip({ 'f.txt': 'V' }));
    await extractAll(
      [
        {
          finalPath: archive,
          artifact: {
            path: archive,
            source: sourceFile(archive),
            rules: [],
            extract: [extractDump('${root}/dumped')],
          },
        },
      ],
      { root: tmpDir },
    );
    expect(existsSync(join(tmpDir, 'dumped', 'f.txt'))).toBe(true);
  });

  it('skips artifacts with no extract rules', async () => {
    const archive = join(tmpDir, 'a.zip');
    await writeFile(archive, makeZip({ 'f.txt': 'V' }));
    await extractAll(
      [
        {
          finalPath: archive,
          artifact: { path: archive, source: sourceFile(archive), rules: [] },
        },
      ],
      {},
    );
    expect(existsSync(`${archive}${EXTRACT_MARKER_SUFFIX}`)).toBe(false);
  });

  it('wraps a failing rule in an ExtractionError naming the artifact', async () => {
    const archive = join(tmpDir, 'a.zip');
    await writeFile(archive, makeZip({ 'present.txt': 'V' }));
    const err = await extractAll(
      [
        {
          finalPath: archive,
          artifact: {
            path: 'mods/broken.zip',
            source: sourceFile(archive),
            rules: [],
            extract: [extractPick('absent.txt', join(tmpDir, 'out'))],
          },
        },
      ],
      {},
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect(err.artifactPath).toBe('mods/broken.zip');
    expect(err.cause).toBeInstanceOf(Error);
  });
});
