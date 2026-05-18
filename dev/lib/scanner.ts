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
import type { Artifact, Integrity, Source } from '@torba/core';
import { sourceFile, sourceUrl, interpolate } from '@torba/core';
import { definePlugin, type TorbaPlugin } from './plugin';
import { applyOverrides, type ArtifactOverride } from './overrides';

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

export interface ArtifactScannerOptions {
  /** Directory to scan. */
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
   * attach rulesets (OS / feature gates), or clear integrity.
   */
  overrides?: ArtifactOverride[];
}

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

async function* scanDirectory(
  options: ArtifactScannerOptions,
  baseDir: string,
): AsyncGenerator<Artifact> {
  const algo = options.hash ?? 'sha1';
  const sourceKind = options.source ?? 'url';
  const files = await walkDir(baseDir);

  for (const file of files) {
    const artifactPath = options.path
      ? applyTemplate(options.path, file)
      : file.rel;

    let integrity: Integrity | undefined;
    let source: Source;
    if (sourceKind === 'file') {
      source = sourceFile(file.abs);
      // trust local file by path — skip hash computation
    } else {
      source = sourceUrl(applyTemplate(options.url, file));
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

/** Scan a local directory tree into artifacts — a generic build-time plugin. */
export function artifactScanner(options: ArtifactScannerOptions): TorbaPlugin {
  return definePlugin({
    name: 'artifactScanner',
    async build(ctx) {
      const baseDir = isAbsolute(options.directory)
        ? options.directory
        : resolve(ctx.configDir, options.directory);
      const scanned: Artifact[] = [];
      for await (const a of scanDirectory(options, baseDir)) scanned.push(a);
      const artifacts = applyOverrides(scanned, options.overrides ?? []);
      const dropped = scanned.length - artifacts.length;
      ctx.log(
        'artifactScanner',
        `scanned ${scanned.length} file(s)` +
          (dropped > 0 ? `, ${dropped} excluded` : ''),
      );
      return { artifacts };
    },
  });
}
