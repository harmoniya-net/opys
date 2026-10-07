/**
 * `artifactScanner` — a local directory, as artifacts.
 *
 * Walking the tree, hashing each file and building the artifacts are the
 * `opys-dev` crate's and are tested there. Placing a file is not: `path` and
 * `url` may be functions, and a function does not cross into Rust. So this
 * asks the crate what is on disk, places each file here, and hands the result
 * back to be hashed.
 */
import { isAbsolute, resolve } from 'node:path';
import { interpolate } from '@opys/core';
import * as napi from '@opys/dev-binding';
import {
  definePlugin,
  type ChainablePlugin,
  type Contribution,
} from './plugin';

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
  /** Size on disk, in bytes. */
  readonly size: number;
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

function applyTemplate(tpl: ScanTemplate, file: ScannedFile): string {
  if (typeof tpl === 'function') return tpl(file);
  return interpolate(tpl, {
    rel: file.rel,
    dir: file.dir,
    filename: file.filename,
  });
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
      const directory = isAbsolute(options.directory)
        ? options.directory
        : resolve(ctx.configDir, options.directory);
      // An `AsyncTask` is typed `Promise<unknown>` by the generated `.d.ts`.
      const files = (await napi.scanDirectory(directory)) as ScannedFile[];
      ctx.log('artifactScanner', `scanned ${files.length} file(s)`);

      const placed = files.map((file) => ({
        abs: file.abs,
        path: options.path ? applyTemplate(options.path, file) : file.rel,
        // A file with a `url` is published elsewhere and pointed at; one
        // without travels with the manifest as a blob.
        ...(options.source === 'blob'
          ? {}
          : { url: applyTemplate(options.url, file) }),
      }));
      const hash = options.source === 'blob' ? undefined : options.hash;
      return (await napi.scannedFiles(placed, hash)) as Contribution;
    },
  });
}
