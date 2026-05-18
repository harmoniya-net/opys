import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceString, type Artifact } from '@torba/core';
import { verifyIntegrity, verifyAll } from '../../lib/phases/verify';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'torba-verify-'));
});
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const digest = (algo: string, body: string) =>
  createHash(algo).update(body).digest('hex');

const write = async (name: string, body: string) => {
  const path = join(dir, name);
  await writeFile(path, body);
  return path;
};

describe('verifyIntegrity', () => {
  it('returns true when no integrity is given', async () => {
    const path = await write('a', 'x');
    expect(await verifyIntegrity(path, undefined)).toBe(true);
  });

  it('verifies a sha1 hash', async () => {
    const path = await write('a', 'hello');
    expect(await verifyIntegrity(path, { sha1: digest('sha1', 'hello') })).toBe(
      true,
    );
  });

  it('verifies a sha256 hash', async () => {
    const path = await write('a', 'hello');
    expect(
      await verifyIntegrity(path, { sha256: digest('sha256', 'hello') }),
    ).toBe(true);
  });

  it('verifies an md5 hash', async () => {
    const path = await write('a', 'hello');
    expect(await verifyIntegrity(path, { md5: digest('md5', 'hello') })).toBe(
      true,
    );
  });

  it('returns false on a hash mismatch', async () => {
    const path = await write('a', 'hello');
    expect(await verifyIntegrity(path, { sha1: '0'.repeat(40) })).toBe(false);
  });

  it('passes when any entry of a multi-hash list matches', async () => {
    const path = await write('a', 'hello');
    expect(
      await verifyIntegrity(path, [
        { sha1: '0'.repeat(40) },
        { sha1: digest('sha1', 'hello') },
      ]),
    ).toBe(true);
  });

  it('fails when no entry of a multi-hash list matches', async () => {
    const path = await write('a', 'hello');
    expect(
      await verifyIntegrity(path, [
        { sha1: '0'.repeat(40) },
        { sha256: '0'.repeat(64) },
      ]),
    ).toBe(false);
  });
});

describe('verifyAll', () => {
  it('returns the paths that failed verification', async () => {
    const good = await write('good', 'ok');
    const bad = await write('bad', 'tampered');
    const tasks = [
      {
        finalPath: good,
        artifact: {
          path: good,
          source: sourceString('ok'),
          rules: [],
          integrity: { sha1: digest('sha1', 'ok') },
        } as Artifact,
      },
      {
        finalPath: bad,
        artifact: {
          path: bad,
          source: sourceString('x'),
          rules: [],
          integrity: { sha1: '0'.repeat(40) },
        } as Artifact,
      },
    ];
    expect(await verifyAll(tasks)).toEqual([bad]);
  });

  it('returns an empty list when every task verifies', async () => {
    const path = await write('a', 'ok');
    expect(
      await verifyAll([
        {
          finalPath: path,
          artifact: { path, source: sourceString('ok'), rules: [] } as Artifact,
        },
      ]),
    ).toEqual([]);
  });
});
