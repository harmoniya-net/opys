import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Integrity } from '@unifest/core';

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

/**
 * Verify a file against an {@link Integrity} descriptor.
 * Returns `true` if skip or if ANY of the stored hashes matches.
 */
export async function verifyIntegrity(
  path: string,
  integrity: Integrity,
): Promise<boolean> {
  if (integrity.isSkip()) return true;
  const entries = integrity.entries();
  if (entries.length === 0) return true;
  for (const entry of entries) {
    const [algo, expected] =
      'sha1' in entry
        ? ['sha1' as const, entry.sha1]
        : ['sha256' as const, entry.sha256];
    if (await checkHash(path, algo, expected)) return true;
  }
  return false;
}
