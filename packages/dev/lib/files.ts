/**
 * `files` — a local directory, as artifacts.
 *
 * Walking the tree, hashing each file and building the artifacts are the
 * `opys-dev` crate's and are tested there. Placing a file is not: `to` and
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

/** A file found by {@link files}, passed to `to` / `url` functions. */
export interface LocalFile {
  /** Path relative to `from`, POSIX separators. */
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
 * A `to` / `url` value: either a template string — interpolating the
 * per-file placeholders `${rel}` / `${dir}` / `${filename}`, with any other
 * `${var}` left for install — or a `(file) => string` function. Only the
 * function form receives the build-machine `abs` path.
 */
export type FileTemplate = string | ((file: LocalFile) => string);

interface FilesFrom {
  /** Directory to take files from, relative to the config file. */
  from: string;
  /** Where each file is installed. Defaults to the file's `rel`. */
  to?: FileTemplate;
}

/**
 * The files travel with the manifest. Each becomes a blob, read from where it
 * is on this machine and written into the bundle. This is what you get by
 * saying nothing more: there is no `url` to give and no `hash` to choose,
 * since a blob is named by its sha256.
 */
export interface EmbeddedFiles extends FilesFrom {
  url?: undefined;
  hash?: undefined;
}

/**
 * The files are published somewhere else, and each artifact points at its
 * copy there. Giving a `url` is what says so.
 */
export interface PublishedFiles extends FilesFrom {
  /** Where an installer fetches each file from. */
  url: FileTemplate;
  /**
   * What each file is pinned with. It is always hashed, so a content change
   * re-fetches it; clear integrity with `removeIntegrity` for deliberate
   * path-trust.
   */
  hash?: 'sha1' | 'sha256';
}

/**
 * Told apart by which field is present, like every shape in opys: with a
 * `url` the files are pointed at, without one they are carried.
 */
export type FilesOptions = EmbeddedFiles | PublishedFiles;

function applyTemplate(template: FileTemplate, file: LocalFile): string {
  if (typeof template === 'function') return template(file);
  return interpolate(template, {
    rel: file.rel,
    dir: file.dir,
    filename: file.filename,
  });
}

/**
 * Every file under a local directory, as artifacts — a generic build-time
 * plugin, and the counterpart of `links`: that one takes what is already
 * published, this one takes what is on your disk.
 *
 * ```js
 * files({ from: 'server-files', to: '${root}/${rel}' }) // carried in the bundle
 * files({ from: 'mods', to: 'mods/${rel}', url: 'https://cdn/${rel}' }) // pointed at
 * ```
 *
 * Post-process the result with the fluent {@link ChainablePlugin} methods,
 * e.g. `files({…}).exclude('**\/*.tmp')`.
 */
export function files(options: FilesOptions): ChainablePlugin {
  return definePlugin({
    name: 'files',
    async build(ctx) {
      const from = isAbsolute(options.from)
        ? options.from
        : resolve(ctx.configDir, options.from);
      // An `AsyncTask` is typed `Promise<unknown>` by the generated `.d.ts`.
      const found = (await napi.scanDirectory(from)) as LocalFile[];
      ctx.log('files', `found ${found.length} file(s) in ${options.from}`);

      const { url } = options;
      const placed = found.map((file) => ({
        abs: file.abs,
        path: options.to ? applyTemplate(options.to, file) : file.rel,
        ...(url === undefined ? {} : { url: applyTemplate(url, file) }),
      }));
      return (await napi.scannedFiles(placed, options.hash)) as Contribution;
    },
  });
}
