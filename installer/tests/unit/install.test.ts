import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sourceString, type Artifact, type Manifest } from '@torba/core';
import { install } from '../../lib/install';

function sha1(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

function makeManifest(artifacts: Artifact[]): Manifest {
  return { vars: {}, artifacts };
}

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'unipack-install-test-'));
});
afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('install: string source', () => {
  it('writes string to final path', async () => {
    const content = 'hello world';
    const dest = join(tmpDir, 'test.txt');
    const artifact: Artifact = {
      path: dest,
      source: sourceString(content),
      size: content.length,
      rules: [],
    };
    await install(makeManifest([artifact]));
    expect(existsSync(dest)).toBe(true);
    expect(await readFile(dest, 'utf8')).toBe(content);
  });

  it('creates parent dirs', async () => {
    const dest = join(tmpDir, 'a', 'b', 'c', 'file.txt');
    const artifact: Artifact = {
      path: dest,
      source: sourceString('nested'),
      size: 6,
      rules: [],
    };
    await install(makeManifest([artifact]));
    expect(existsSync(dest)).toBe(true);
  });
});

describe('install: integrity', () => {
  it('skips cached file with correct hash', async () => {
    const content = 'cached content';
    const dest = join(tmpDir, 'cached.txt');
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(dest, content);
    let downloadEmitted = false;
    const artifact: Artifact = {
      path: dest,
      source: sourceString(content),
      size: content.length,
      rules: [],
      integrity: { sha1: sha1(content) },
    };
    await install(makeManifest([artifact]), {
      onProgress: (p) => {
        if (p.phase === 'download' && p.fetched > 0) downloadEmitted = true;
      },
    });
    expect(downloadEmitted).toBe(false);
  });

  it('throws on hash mismatch', async () => {
    const dest = join(tmpDir, 'bad.txt');
    const artifact: Artifact = {
      path: dest,
      source: sourceString('content'),
      size: 7,
      rules: [],
      integrity: { sha1: '0000000000000000000000000000000000000000' },
    };
    await expect(install(makeManifest([artifact]))).rejects.toThrow(
      'Integrity check failed',
    );
  });

  it.skip('accepts any hash in multi-hash integrity', async () => {
    const content = 'multi-hash';
    const dest = join(tmpDir, 'multi.txt');
    const artifact: Artifact = {
      path: dest,
      source: sourceString(content),
      size: content.length,
      rules: [],
      integrity: [
        { sha1: '0000000000000000000000000000000000000000' },
        { sha1: sha1(content) },
      ],
    };
    await install(makeManifest([artifact]));
    expect(await readFile(dest, 'utf8')).toBe(content);
  });
});
