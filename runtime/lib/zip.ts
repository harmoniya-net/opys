import { mkdir, writeFile, symlink, chmod, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { isTarPath, readTarArchive, type TarEntry } from './tar';

export function matchesGlob(name: string, pattern: string): boolean {
  if (pattern.endsWith('/*') || pattern.endsWith('/')) {
    const prefix = pattern.endsWith('/*') ? pattern.slice(0, -1) : pattern;
    return name.startsWith(prefix);
  }
  if (pattern.endsWith('*')) return name.startsWith(pattern.slice(0, -1));
  if (pattern.startsWith('*')) return name.endsWith(pattern.slice(1));
  return name === pattern;
}

interface NormalizedEntry {
  name: string;
  kind: 'file' | 'symlink';
  content?: Uint8Array;
  linkTarget?: string;
  mode?: number;
}

async function readArchive(archivePath: string): Promise<NormalizedEntry[]> {
  const data = new Uint8Array(await readFile(archivePath));
  if (isTarPath(archivePath)) {
    return readTarArchive(archivePath, data).map(toNormalized);
  }
  const files = unzipSync(data);
  const entries: NormalizedEntry[] = [];
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    entries.push({ name, kind: 'file', content });
  }
  return entries;
}

function toNormalized(entry: TarEntry): NormalizedEntry {
  if (entry.kind === 'file') {
    return {
      name: entry.name,
      kind: 'file',
      content: entry.content,
      mode: entry.mode,
    };
  }
  return { name: entry.name, kind: 'symlink', linkTarget: entry.linkTarget };
}

async function writeEntry(
  entry: NormalizedEntry,
  destDir: string,
  outName: string,
): Promise<void> {
  const dest = join(destDir, outName);
  await mkdir(dirname(dest), { recursive: true });
  if (entry.kind === 'file') {
    await writeFile(dest, entry.content!);
    // Preserve the executable bit when present (Adoptium tar entries
    // for `bin/java`, `bin/javac` etc. carry mode 0755).
    if (entry.mode && entry.mode & 0o111) {
      await chmod(dest, entry.mode & 0o777);
    }
    return;
  }
  // Symlink. On Windows non-admin users can't symlink — fall back to a
  // best-effort copy. The link target is interpreted relative to the
  // symlink's own directory, which is what `fs.symlink` does on POSIX.
  try {
    await symlink(entry.linkTarget!, dest);
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err &&
      'code' in err &&
      (err as { code?: string }).code === 'EPERM'
    ) {
      // Best-effort: leave the symlink unwritten; the runtime will fail
      // loudly if the link is actually needed. JDKs we care about don't
      // depend on symlinks for the launch path.
      return;
    }
    throw err;
  }
}

export async function extractZip(
  archivePath: string,
  targetDir: string,
  includes: string[] | undefined,
  excludes: string[] | undefined,
  stripPrefixes?: string[],
): Promise<void> {
  const entries = await readArchive(archivePath);
  const writes: Promise<void>[] = [];
  for (const entry of entries) {
    if (includes && !includes.some((p) => matchesGlob(entry.name, p))) continue;
    if (excludes && excludes.some((p) => matchesGlob(entry.name, p))) continue;
    let outName = entry.name;
    if (stripPrefixes) {
      for (const p of stripPrefixes) {
        if (outName.startsWith(p)) {
          outName = outName.slice(p.length);
          break;
        }
      }
      if (!outName) continue;
    }
    writes.push(writeEntry(entry, targetDir, outName));
  }
  await Promise.all(writes);
}

export async function extractZipPick(
  archivePath: string,
  entryName: string,
  destPath: string,
): Promise<void> {
  const entries = await readArchive(archivePath);
  const found = entries.find((e) => e.name === entryName);
  if (!found || found.kind !== 'file') {
    throw new Error(`Archive ${archivePath} has no file entry '${entryName}'`);
  }
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, found.content!);
  if (found.mode && found.mode & 0o111) {
    await chmod(destPath, found.mode & 0o777);
  }
}
