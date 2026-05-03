import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import type { Artifact, HashEntry, Integrity } from '@torba/core';
import { sourceFile, sourceUrl } from '@torba/core';
import { interpolate } from '@torba/core';
import type { OverrideConfig } from '@torba/core';

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
  overrides?: OverrideConfig[];
}

function globMatches(pattern: string, path: string): boolean {
  const re = pattern
    .replace(/[.+^${}()|[\]\\*]/g, '\\$&')
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*');
  return new RegExp(`^${re}$`).test(path);
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
  const overrides = options.overrides ?? [];
  const sourceKind = options.source ?? 'url';
  const files = await walkDir(options.directory);

  for (const file of files) {
    const override = overrides.find((o) => globMatches(o.path, file.rel));
    if (override?.exclude) continue;

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
      source = sourceUrl(interpolate(override?.url ?? options.url, vars));
      if (override?.hashes?.length) {
        integrity = override.hashes as HashEntry[];
      } else {
        const digest = await hashFile(file.abs, algo);
        const computed: HashEntry =
          algo === 'sha1' ? { sha1: digest } : { sha256: digest };
        const entries = override?.extraHashes
          ? [computed, ...(override.extraHashes as HashEntry[])]
          : [computed];
        integrity = entries.length === 1 ? entries[0] : entries;
      }
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
