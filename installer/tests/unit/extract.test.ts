import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  sourceFile,
  extractDump,
  type Artifact,
  type Manifest,
} from '@torba/core';
import { install } from '../../lib/install';

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

  it('skips extraction when artifact is cached', async () => {
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
    expect(existsSync(join(targetDir, 'file.txt'))).toBe(false);
  });
});
