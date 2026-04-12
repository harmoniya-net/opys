import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import type { Unifact } from '@unifest/core';
import {
  sourceFile,
  sourceUrl,
  exactSize,
  sha1Integrity,
  ofIntegrity,
} from '@unifest/core';
import { interpolate, type HashEntry } from '@unifest/core';
import type { OverrideConfig } from '@unifest/core';

export interface ArtifactScannerOptions {
  directory: string;
  url: string;
  base_path?: string;
  hash?: 'sha1' | 'sha256';
  mode: 'build' | 'launch';
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
): AsyncGenerator<Unifact> {
  const algo = options.hash ?? 'sha1';
  const basePath = options.base_path ?? '${path}';
  const overrides = options.overrides ?? [];
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

    const artifactPath = interpolate(basePath, vars);
    const artifactSource =
      options.mode === 'launch'
        ? sourceFile(file.abs)
        : sourceUrl(interpolate(override?.url ?? options.url, vars));

    let integrity: { kind: 'skip' } | { kind: 'hashes'; entries: HashEntry[] };
    if (override?.hashes?.length) {
      integrity = ofIntegrity(override.hashes as HashEntry[]);
    } else {
      const digest = await hashFile(file.abs, algo);
      const computed: HashEntry =
        algo === 'sha1' ? { sha1: digest } : { sha256: digest };
      const entries = override?.extra_hashes
        ? [computed, ...(override.extra_hashes as HashEntry[])]
        : [computed];
      integrity = ofIntegrity(entries);
    }

    yield {
      path: artifactPath,
      source: artifactSource,
      size: exactSize(file.size),
      rules: [],
      integrity,
    };
  }
}
