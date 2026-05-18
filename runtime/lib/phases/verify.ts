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
  // Each entry names exactly one algorithm; the file passes if any entry
  // matches. A read error (e.g. missing file) resolves to `false`.
  return Promise.all(
    entries.map((e) => {
      if ('sha1' in e) return checkHash(path, 'sha1', e.sha1);
      if ('sha256' in e) return checkHash(path, 'sha256', e.sha256);
      return checkHash(path, 'md5', e.md5);
    }),
  ).then(
    (results) => results.some(Boolean),
    () => false,
  );
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
