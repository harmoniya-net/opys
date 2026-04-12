import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isIntegritySkip } from '@unifest/core';
import type { Integrity, HashEntry } from '@unifest/core';

export async function readBytes(path: string): Promise<Buffer> {
  return readFile(path);
}

export async function checkHash(
  path: string,
  algo: 'sha1' | 'sha256',
  expected: string,
): Promise<boolean> {
  const hash = createHash(algo);
  hash.update(await readFile(path));
  return hash.digest('hex') === expected;
}

async function verifyHashEntry(
  path: string,
  entry: HashEntry,
): Promise<boolean> {
  if ('sha1' in entry) {
    return checkHash(path, 'sha1', entry.sha1);
  }
  return checkHash(path, 'sha256', entry.sha256);
}

export async function verifyIntegrity(
  path: string,
  integrity: Integrity,
): Promise<boolean> {
  if (isIntegritySkip(integrity)) return true;
  if (integrity.kind !== 'hashes') return true;
  const entries = integrity.entries;
  if (entries.length === 0) return true;
  for (const entry of entries) {
    if (await verifyHashEntry(path, entry)) return true;
  }
  return false;
}
