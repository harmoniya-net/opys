import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Unifact, Integrity } from '@unifest/core';
import { isIntegritySkip } from '@unifest/core';

async function checkHash(
  path: string,
  algo: 'sha1' | 'sha256',
  expected: string,
): Promise<boolean> {
  const hash = createHash(algo);
  hash.update(await readFile(path));
  return hash.digest('hex') === expected;
}

export function verifyIntegrity(
  path: string,
  integrity: Integrity,
): Promise<boolean> {
  if (isIntegritySkip(integrity)) return Promise.resolve(true);
  const entries = integrity.kind === 'hashes' ? integrity.entries : [];
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
      return false;
    }),
  ).catch(() => false);
}

export async function verifyAll(
  tasks: { finalPath: string; unifact: Unifact }[],
): Promise<string[]> {
  const results = await Promise.all(
    tasks.map(async ({ finalPath, unifact }) => {
      const ok = await verifyIntegrity(finalPath, unifact.integrity);
      return ok ? null : finalPath;
    }),
  );
  return results.filter((p): p is string => p !== null);
}
