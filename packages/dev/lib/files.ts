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
import * as napi from '@opys/dev-binding';
import {
  definePlugin,
  pluginOptions,
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
 * Where a file goes, or where it is fetched from: a function of the file.
 * What it returns may hold install-time vars — `${game_directory}` — which
 * are filled in on the installing machine.
 *
 * It was a template string too, once, with placeholders of its own
 * (`${rel}`) beside the install-time ones in the same string. Two kinds of
 * `${…}` read alike and were filled in at different times, and the
 * placeholder names were a convention nothing checked; a function says the
 * same thing with a typed argument.
 */
export type FilePlace = (file: LocalFile) => string;

interface FilesFrom {
  /** Directory to take files from, relative to the config file. */
  from: string;
  /** Where each file is installed. Defaults to the file's `rel`. */
  to?: FilePlace;
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
  url: FilePlace;
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

/**
 * Every file under a local directory, as artifacts — a generic build-time
 * plugin, and the counterpart of `links`: that one takes what is already
 * published, this one takes what is on your disk.
 *
 * ```js
 * // carried in the bundle
 * files({ from: 'server-files', to: (file) => '${root}/' + file.rel })
 * // pointed at
 * files({
 *   from: 'mods',
 *   to: (file) => '${game_directory}/mods/' + file.rel,
 *   url: (file) => 'https://cdn.example.com/' + file.rel,
 * })
 * ```
 *
 * Post-process the result with the fluent {@link ChainablePlugin} methods,
 * e.g. `files({…}).exclude('**\/*.tmp')`.
 */
export function files(options: FilesOptions): ChainablePlugin<'files', never> {
  const { to, url } = pluginOptions("files({ from: 'overrides' })", options);
  for (const [name, place] of Object.entries({ to, url }))
    if (place !== undefined && typeof place !== 'function')
      throw new TypeError(
        `files: \`${name}\` is a function of the file now — ${name}: (file) => '\${game_directory}/' + file.rel — and was given ${JSON.stringify(place)}`,
      );
  return definePlugin({
    name: 'files',
    async build(ctx) {
      const from = isAbsolute(options.from)
        ? options.from
        : resolve(ctx.configDir, options.from);
      // An `AsyncTask` is typed `Promise<unknown>` by the generated `.d.ts`.
      const found = (await napi.scanDirectory(from)) as LocalFile[];
      ctx.log('files', `found ${found.length} file(s) in ${options.from}`);

      const placed = found.map((file) => ({
        abs: file.abs,
        path: to ? to(file) : file.rel,
        ...(url === undefined ? {} : { url: url(file) }),
      }));
      return (await napi.scannedFiles(
        placed,
        options.hash,
      )) as Contribution<never>;
    },
  });
}
