import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import type { Artifact, BlobSource, Integrity } from '@opys/core';
import {
  blobFile,
  hashBlobFile,
  interpolate,
  sourceBlob,
  sourceUrl,
} from '@opys/core';
import { definePlugin, type ChainablePlugin } from './plugin';

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
 * per-file placeholders `${rel}` / `${dir}` / `${filename}`, with any other
 * `${var}` left for install — or a `(file) => string` function. Only the
 * function form receives the build-machine `abs` path.
 */
export type ScanTemplate = string | ((file: ScannedFile) => string);

interface ScanOptions {
  /** Directory to scan. */
  directory: string;
  /** Destination path — template or function. Defaults to the file's `rel`. */
  path?: ScanTemplate;
}

/** Each file is published somewhere, and the artifact points at it. */
export interface UrlScannerOptions extends ScanOptions {
  source?: 'url';
  /** URL for fetching each file — template string or `(file) => string`. */
  url: ScanTemplate;
  /**
   * The file is always hashed, so a content change re-fetches it; clear
   * integrity with an override for deliberate path-trust.
   */
  hash?: 'sha1' | 'sha256';
}

/**
 * Each file travels with the manifest: it becomes a blob, read from where it
 * is on this machine and written into the bundle. There is no `url` to give
 * and no `hash` to choose — a blob is named by its sha256.
 */
export interface BlobScannerOptions extends ScanOptions {
  source: 'blob';
}

export type ArtifactScannerOptions = UrlScannerOptions | BlobScannerOptions;

/** A {@link ScannedFile} carrying its on-disk `size`. */
type ScannedEntry = ScannedFile & { readonly size: number };

async function walkDir(dir: string): Promise<ScannedEntry[]> {
  async function walk(cur: string): Promise<ScannedEntry[]> {
    const entries = await readdir(cur, { withFileTypes: true });
    const results = await Promise.all(
      entries.map(async (e) => {
        const abs = join(cur, e.name);
        if (e.isDirectory()) return walk(abs);
        if (e.isFile()) {
          const { size } = await stat(abs);
          const rel = relative(dir, abs).replace(/\\/g, '/');
          const d = dirname(rel);
          return [
            {
              rel,
              dir: d === '.' ? '' : d,
              filename: basename(rel),
              abs,
              size,
            },
          ];
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
    dir: file.dir,
    filename: file.filename,
  });
}

/** One scanned file as an artifact, and the blob it is made of if it is one. */
interface Scanned {
  artifact: Artifact;
  blob?: { id: string; file: string };
}

async function scanFile(
  options: ArtifactScannerOptions,
  file: ScannedEntry,
): Promise<Scanned> {
  const path = options.path ? applyTemplate(options.path, file) : file.rel;

  if (options.source === 'blob') {
    const { id, size } = await hashBlobFile(file.abs);
    return {
      artifact: { path, source: sourceBlob(id), size, rules: [] },
      blob: { id, file: file.abs },
    };
  }

  // Hashed even though the file is fetched from elsewhere: a hashless
  // artifact is skipped by path alone and never re-fetched, so a content
  // change would never be picked up.
  const algo = options.hash ?? 'sha1';
  const digest = await hashFile(file.abs, algo);
  const integrity: Integrity =
    algo === 'sha1' ? { sha1: digest } : { sha256: digest };
  return {
    artifact: {
      path,
      source: sourceUrl(applyTemplate(options.url, file)),
      size: file.size,
      rules: [],
      integrity,
    },
  };
}

/**
 * Scan a local directory tree into artifacts — a generic build-time plugin.
 * Post-process the result with the fluent {@link ChainablePlugin} methods, e.g.
 * `artifactScanner({…}).exclude('**\/*.tmp').removeIntegrity('**\/options.txt')`.
 */
export function artifactScanner(
  options: ArtifactScannerOptions,
): ChainablePlugin {
  return definePlugin({
    name: 'artifactScanner',
    async build(ctx) {
      const baseDir = isAbsolute(options.directory)
        ? options.directory
        : resolve(ctx.configDir, options.directory);
      const scanned: Scanned[] = [];
      for (const file of await walkDir(baseDir)) {
        scanned.push(await scanFile(options, file));
      }
      ctx.log('artifactScanner', `scanned ${scanned.length} file(s)`);
      const blobs: Record<string, BlobSource> = {};
      for (const { blob } of scanned) {
        if (blob) blobs[blob.id] = blobFile(blob.file);
      }
      return { artifacts: scanned.map((s) => s.artifact), blobs };
    },
  });
}
