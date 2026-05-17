import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import type { Artifact, Integrity } from '@torba/core';
import { sourceFile, sourceUrl } from '@torba/core';
import { interpolate } from '@torba/core';

export interface ArtifactScannerOptions {
  directory: string;
  /** URL template for fetching. Supports `${path}`, `${dir}`, `${filename}`. */
  url: string;
  /**
   * Destination path template for installing. Supports the same placeholders as `url`.
   * Defaults to `${path}` (use the file's relative path verbatim).
   */
  path?: string;
  hash?: 'sha1' | 'sha256';
  /**
   * 'url'  → emit sourceUrl + computed hash (default)
   * 'file' → emit sourceFile pointing at the local copy; skip hashing entirely
   */
  source?: 'url' | 'file';
}

interface FileEntry {
  rel: string;
  abs: string;
  size: number;
}

async function walkDir(dir: string): Promise<FileEntry[]> {
  async function walk(cur: string): Promise<FileEntry[]> {
    const entries = await readdir(cur, { withFileTypes: true });
    const results = await Promise.all(
      entries.map(async (e) => {
        const abs = join(cur, e.name);
        if (e.isDirectory()) return walk(abs);
        if (e.isFile()) {
          const { size } = await stat(abs);
          return [{ rel: relative(dir, abs).replace(/\\/g, '/'), abs, size }];
        }
        return [];
      }),
    );
    return results.flat();
  }
  return walk(dir);
}

async function hashFile(
  path: string,
  algo: 'sha1' | 'sha256',
): Promise<string> {
  return createHash(algo)
    .update(await readFile(path))
    .digest('hex');
}

export async function* artifactScanner(
  options: ArtifactScannerOptions,
): AsyncGenerator<Artifact> {
  const algo = options.hash ?? 'sha1';
  const pathTemplate = options.path ?? '${path}';
  const sourceKind = options.source ?? 'url';
  const files = await walkDir(options.directory);

  for (const file of files) {
    const d = dirname(file.rel);
    const vars = {
      path: file.rel,
      abs: file.abs,
      filename: basename(file.rel),
      dir: d === '.' ? '' : d,
    };

    const artifactPath = interpolate(pathTemplate, vars);

    let integrity: Integrity | undefined;
    let source;
    if (sourceKind === 'file') {
      source = sourceFile(file.abs);
      // trust local file by path — skip hash computation
    } else {
      source = sourceUrl(interpolate(options.url, vars));
      const digest = await hashFile(file.abs, algo);
      integrity = algo === 'sha1' ? { sha1: digest } : { sha256: digest };
    }

    yield {
      path: artifactPath,
      source,
      size: file.size,
      rules: [],
      integrity,
    };
  }
}
