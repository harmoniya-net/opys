import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  skipIntegrity,
  sha1Integrity,
  sourceString,
  exactSize,
  emptyValDefs,
  ofIntegrity,
  type Unifact,
  type Unifest,
} from '@unifest/core';
import { install } from '../../lib/install';

function sha1(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

function makeManifest(unifacts: Unifact[]): Unifest {
  return { vars: emptyValDefs(), unifacts };
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
    const unifact: Unifact = {
      path: dest,
      source: sourceString(content),
      size: exactSize(content.length),
      rules: [],
      integrity: skipIntegrity(),
    };
    await install(makeManifest([unifact]));
    expect(existsSync(dest)).toBe(true);
    expect(await readFile(dest, 'utf8')).toBe(content);
  });

  it('creates parent dirs', async () => {
    const dest = join(tmpDir, 'a', 'b', 'c', 'file.txt');
    const unifact: Unifact = {
      path: dest,
      source: sourceString('nested'),
      size: exactSize(6),
      rules: [],
      integrity: skipIntegrity(),
    };
    await install(makeManifest([unifact]));
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
    const unifact: Unifact = {
      path: dest,
      source: sourceString(content),
      size: exactSize(content.length),
      rules: [],
      integrity: sha1Integrity(sha1(content)),
    };
    await install(makeManifest([unifact]), {
      onProgress: (p) => {
        if (p.phase === 'download' && p.fetched > 0) downloadEmitted = true;
      },
    });
    expect(downloadEmitted).toBe(false);
  });

  it('throws on hash mismatch', async () => {
    const dest = join(tmpDir, 'bad.txt');
    const unifact: Unifact = {
      path: dest,
      source: sourceString('content'),
      size: exactSize(7),
      rules: [],
      integrity: sha1Integrity('0000000000000000000000000000000000000000'),
    };
    await expect(install(makeManifest([unifact]))).rejects.toThrow(
      'Integrity check failed',
    );
  });

  it.skip('accepts any hash in multi-hash integrity', async () => {
    const content = 'multi-hash';
    const dest = join(tmpDir, 'multi.txt');
    const unifact: Unifact = {
      path: dest,
      source: sourceString(content),
      size: exactSize(content.length),
      rules: [],
      integrity: ofIntegrity([
        { sha1: '0000000000000000000000000000000000000000' },
        { sha1: sha1(content) },
      ]),
    };
    await install(makeManifest([unifact]));
    expect(await readFile(dest, 'utf8')).toBe(content);
  });
});
