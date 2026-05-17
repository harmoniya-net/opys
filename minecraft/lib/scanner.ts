import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import type { Artifact, Integrity } from '@torba/core';
import { sourceFile, sourceUrl, interpolate } from '@torba/core';
import type { ArtifactOverride } from '@torba/dev';

/** A file discovered by {@link artifactScanner}, passed to `path`/`url` functions. */
export interface ScannedFile {
  /** Path relative to `directory`, POSIX separators. */
  readonly rel: string;
  /** Directory portion of `rel` (`''` at the root). */
  readonly dir: string;
  /** Final path segment. */
  readonly filename: string;
  /** Absolute path on the build machine. */
  readonly abs: string;
}

/**
 * A `path` / `url` value: either a template string — interpolating the
 * per-file placeholders `${rel}` / `${dir}` / `${filename}` (and `${path}`,
 * a legacy alias of `${rel}`), with any other `${var}` left for install —
 * or a `(file) => string` function.
 */
export type ScanTemplate = string | ((file: ScannedFile) => string);

export interface ArtifactScannerOptions {
  directory: string;
  /** URL for fetching each file — template string or `(file) => string`. */
  url: ScanTemplate;
  /** Destination path — template or function. Defaults to the file's `rel`. */
  path?: ScanTemplate;
  hash?: 'sha1' | 'sha256';
  /**
   * 'url'  → emit sourceUrl + computed hash (default)
   * 'file' → emit sourceFile pointing at the local copy; skip hashing entirely
   */
  source?: 'url' | 'file';
  /**
   * Per-selector patches applied to the scanned artifacts — exclude files,
   * attach rulesets (OS / feature gates), or clear integrity. Applied by
   * the `artifactScanner` plugin after the directory walk.
   */
  overrides?: ArtifactOverride[];
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

function applyTemplate(tpl: ScanTemplate, file: ScannedFile): string {
  if (typeof tpl === 'function') return tpl(file);
  return interpolate(tpl, {
    rel: file.rel,
    path: file.rel, // legacy alias of ${rel}
    dir: file.dir,
    filename: file.filename,
    abs: file.abs,
  });
}

export async function* artifactScanner(
  options: ArtifactScannerOptions,
): AsyncGenerator<Artifact> {
  const algo = options.hash ?? 'sha1';
  const sourceKind = options.source ?? 'url';
  const files = await walkDir(options.directory);

  for (const file of files) {
    const d = dirname(file.rel);
    const scanned: ScannedFile = {
      rel: file.rel,
      dir: d === '.' ? '' : d,
      filename: basename(file.rel),
      abs: file.abs,
    };

    const artifactPath = options.path
      ? applyTemplate(options.path, scanned)
      : file.rel;

    let integrity: Integrity | undefined;
    let source;
    if (sourceKind === 'file') {
      source = sourceFile(file.abs);
      // trust local file by path — skip hash computation
    } else {
      source = sourceUrl(applyTemplate(options.url, scanned));
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
