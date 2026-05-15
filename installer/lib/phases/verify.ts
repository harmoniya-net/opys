import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Artifact, Integrity } from '@torba/core';
import { integrityHashes } from '@torba/core';

async function checkHash(
  path: string,
  algo: 'sha1' | 'sha256' | 'md5',
  expected: string,
): Promise<boolean> {
  const hash = createHash(algo);
  hash.update(await readFile(path));
  return hash.digest('hex') === expected;
}

export function verifyIntegrity(
  path: string,
  integrity: Integrity | undefined,
): Promise<boolean> {
  const entries = integrityHashes(integrity);
  if (entries.length === 0) return Promise.resolve(true);
  return Promise.any(
    entries.map(async (e) => {
      if ('sha1' in e) {
        const ok = await checkHash(path, 'sha1', e.sha1);
        if (ok) return true;
      }
      if ('sha256' in e) {
        const ok = await checkHash(path, 'sha256', e.sha256);
        if (ok) return true;
      }
      if ('md5' in e) {
        const ok = await checkHash(path, 'md5', e.md5);
        if (ok) return true;
      }
      return false;
    }),
  ).catch(() => false);
}

export async function verifyAll(
  tasks: { finalPath: string; artifact: Artifact }[],
): Promise<string[]> {
  const results = await Promise.all(
    tasks.map(async ({ finalPath, artifact }) => {
      const ok = await verifyIntegrity(finalPath, artifact.integrity);
      return ok ? null : finalPath;
    }),
  );
  return results.filter((p): p is string => p !== null);
}
