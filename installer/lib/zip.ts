import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { readBytes } from './fs';

export function matchesGlob(name: string, pattern: string): boolean {
  if (pattern.endsWith('/*') || pattern.endsWith('/')) {
    const prefix = pattern.endsWith('/*') ? pattern.slice(0, -1) : pattern;
    return name.startsWith(prefix);
  }
  if (pattern.endsWith('*')) return name.startsWith(pattern.slice(0, -1));
  if (pattern.startsWith('*')) return name.endsWith(pattern.slice(1));
  return name === pattern;
}

export async function extractZip(
  zipPath: string,
  targetDir: string,
  includes: string[] | undefined,
  excludes: string[] | undefined,
): Promise<void> {
  const data = new Uint8Array(await readBytes(zipPath));
  const files = unzipSync(data);
  const writes: Promise<void>[] = [];
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    if (includes && !includes.some((p) => matchesGlob(name, p))) continue;
    if (excludes && excludes.some((p) => matchesGlob(name, p))) continue;
    const dest = join(targetDir, name);
    writes.push(
      mkdir(dirname(dest), { recursive: true }).then(() =>
        writeFile(dest, content),
      ),
    );
  }
  await Promise.all(writes);
}
