import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Integrity,
  Source,
  Unifact,
  Unifest,
  UnifactSize,
  ValDefs,
} from '@unifest/core';
import { Ruleset } from '@unifest/rules';
import { install } from '../../lib/install';

function sha1(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

function makeManifest(unifacts: Unifact[]): Unifest {
  return new Unifest(new ValDefs([]), undefined, unifacts);
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'unipack-install-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('install: string source', () => {
  it('writes string content to the final path', async () => {
    const content = 'hello world';
    const dest = join(tmpDir, 'test.txt');

    const unifact = new Unifact(
      dest,
      Source.string(content),
      UnifactSize.exact(content.length),
      Ruleset.empty(),
      Integrity.skip(),
      undefined,
      undefined,
    );

    await install(makeManifest([unifact]));

    expect(existsSync(dest)).toBe(true);
    expect(await readFile(dest, 'utf8')).toBe(content);
  });

  it('creates parent directories as needed', async () => {
    const dest = join(tmpDir, 'a', 'b', 'c', 'file.txt');

    const unifact = new Unifact(
      dest,
      Source.string('nested'),
      UnifactSize.unknown(),
      Ruleset.empty(),
      Integrity.skip(),
      undefined,
      undefined,
    );

    await install(makeManifest([unifact]));

    expect(existsSync(dest)).toBe(true);
  });
});

describe('install: options', () => {
  it('respects custom concurrency (smoke)', async () => {
    const files = Array.from({ length: 10 }, (_, i) => {
      const content = `file-${i}`;
      return new Unifact(
        join(tmpDir, `file-${i}.txt`),
        Source.string(content),
        UnifactSize.exact(content.length),
        Ruleset.empty(),
        Integrity.skip(),
        undefined,
        undefined,
      );
    });

    await install(makeManifest(files), { concurrency: 2 });

    for (let i = 0; i < 10; i++) {
      expect(existsSync(join(tmpDir, `file-${i}.txt`))).toBe(true);
    }
  });

  it('calls onProgress', async () => {
    const calls: [number, number][] = [];
    const files = Array.from(
      { length: 3 },
      (_, i) =>
        new Unifact(
          join(tmpDir, `f${i}.txt`),
          Source.string(`content-${i}`),
          UnifactSize.unknown(),
          Ruleset.empty(),
          Integrity.skip(),
          undefined,
          undefined,
        ),
    );

    // onProgress is throttled (≤1/s); the final state always shows all files done.
    await install(makeManifest(files), {
      onProgress: (p) => {
        if (p.phase === 'download' && p.fetched > 0)
          calls.push([p.fetched, p.total]);
      },
    });

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1]).toEqual([3, 3]);
  });
});

describe('install: verifyIntegrity: false', () => {
  it('installs without checking hashes when verifyIntegrity is false', async () => {
    const dest = join(tmpDir, 'no-check.txt');
    const unifact = new Unifact(
      dest,
      Source.string('content'),
      UnifactSize.unknown(),
      Ruleset.empty(),
      Integrity.sha1('0000000000000000000000000000000000000000'), // wrong hash
      undefined,
      undefined,
    );

    // Would throw with verifyIntegrity: true, but passes with false
    await expect(
      install(makeManifest([unifact]), { verifyIntegrity: false }),
    ).resolves.toBeUndefined();
    expect(existsSync(dest)).toBe(true);
  });

  it('skips cached-file hash check when verifyIntegrity is false', async () => {
    const dest = join(tmpDir, 'cached-no-check.txt');
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(dest, 'stale content'),
    );

    // Wrong hash on disk — normally triggers re-download, but with no-verify it skips
    const unifact = new Unifact(
      dest,
      Source.string('correct'),
      UnifactSize.unknown(),
      Ruleset.empty(),
      Integrity.sha1('0000000000000000000000000000000000000000'),
      undefined,
      undefined,
    );

    let downloadEmitted = false;
    await install(makeManifest([unifact]), {
      verifyIntegrity: false,
      onProgress: (p) => {
        if (p.phase === 'download' && p.fetched > 0) downloadEmitted = true;
      },
    });

    // With no-verify, cached file is skipped without re-download
    expect(downloadEmitted).toBe(false);
  });
});

describe('install: integrity', () => {
  it('skips already-cached file with correct hash', async () => {
    const content = 'cached content';
    const dest = join(tmpDir, 'cached.txt');
    await import('node:fs/promises').then((fs) => fs.writeFile(dest, content));

    let downloadEmitted = false;
    const unifact = new Unifact(
      dest,
      Source.string(content),
      UnifactSize.exact(content.length),
      Ruleset.empty(),
      Integrity.sha1(sha1(content)),
      undefined,
      undefined,
    );

    await install(makeManifest([unifact]), {
      onProgress: (p) => {
        if (p.phase === 'download' && p.fetched > 0) downloadEmitted = true;
      },
    });

    // File was cached → nothing downloaded → no download events emitted
    expect(downloadEmitted).toBe(false);
  });

  it('throws on hash mismatch after download', async () => {
    const dest = join(tmpDir, 'bad.txt');

    const unifact = new Unifact(
      dest,
      Source.string('actual content'),
      UnifactSize.unknown(),
      Ruleset.empty(),
      Integrity.sha1('0000000000000000000000000000000000000000'),
      undefined,
      undefined,
    );

    await expect(install(makeManifest([unifact]))).rejects.toThrow(
      'Integrity check failed',
    );
  });

  it('re-downloads file with mismatched hash on disk', async () => {
    const content = 'correct content';
    const dest = join(tmpDir, 'stale.txt');
    // Write wrong content so hash check fails and triggers re-download
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(dest, 'wrong content'),
    );

    const unifact = new Unifact(
      dest,
      Source.string(content),
      UnifactSize.exact(content.length),
      Ruleset.empty(),
      Integrity.sha1(sha1(content)),
      undefined,
      undefined,
    );

    await install(makeManifest([unifact]));

    expect(await readFile(dest, 'utf8')).toBe(content);
  });

  it('accepts file if any hash in multi-hash integrity matches', async () => {
    const content = 'multi-hash content';
    const dest = join(tmpDir, 'multi.txt');

    const unifact = new Unifact(
      dest,
      Source.string(content),
      UnifactSize.unknown(),
      Ruleset.empty(),
      Integrity.of([
        { sha1: '0000000000000000000000000000000000000000' }, // wrong
        { sha1: sha1(content) }, // correct
      ]),
      undefined,
      undefined,
    );

    await install(makeManifest([unifact]));
    expect(await readFile(dest, 'utf8')).toBe(content);
  });

  it('throws when no hash in multi-hash array matches', async () => {
    const dest = join(tmpDir, 'bad-multi.txt');

    const unifact = new Unifact(
      dest,
      Source.string('content'),
      UnifactSize.unknown(),
      Ruleset.empty(),
      Integrity.of([
        { sha1: '0000000000000000000000000000000000000000' },
        {
          sha256:
            '0000000000000000000000000000000000000000000000000000000000000000',
        },
      ]),
      undefined,
      undefined,
    );

    await expect(install(makeManifest([unifact]))).rejects.toThrow(
      'Integrity check failed',
    );
  });
});
