import { isAbsolute, resolve } from 'node:path';
import type { Artifact, Blobs, Launch, Val, Valset } from '@opys/core';
import type { LaunchGroups } from './plugin';

/** Shared shape of the vanilla / forge-family loader templates. */
export interface LoaderTemplate {
  /**
   * Where the blobs among the artifacts are kept: empty, and so left out,
   * unless the config added a library from its own disk.
   */
  blobs?: Blobs;
  launch: Launch;
  jvmArgs: Valset;
  mainClass: Val;
  gameArgs: Valset;
}

/**
 * The launch groups every loader exposes, and so what a config may name on
 * any of them: `'@forge.jvmArgs'`, `'@fabric.mainClass'`.
 */
export type LoaderGroups = 'command' | 'jvmArgs' | 'mainClass' | 'gameArgs';

/** Project a loader template's launch surface into named groups. */
export function launchGroups(t: LoaderTemplate): LaunchGroups<LoaderGroups> {
  return {
    command: t.launch.command,
    jvmArgs: t.jvmArgs,
    mainClass: t.mainClass,
    gameArgs: t.gameArgs,
  };
}

/**
 * A library a config adds to a loader: a name, and an artifact — the type a
 * config already writes under `manifest.artifacts`, with its `rules`,
 * `integrity` and `extract`. It goes ahead of everything on the classpath,
 * and takes the place of the version's own library of the same
 * `group:artifact`.
 *
 * Two things differ from a manifest's artifact. `path` is relative to the
 * library directory, as a version JSON's is. And `source` may be a `file`: a
 * jar beside the config, which is carried in the bundle.
 *
 * ```js
 * forge({
 *   version: '1.20.1',
 *   libraries: [
 *     {
 *       name: 'org.example:tool:1.2',
 *       artifact: {
 *         path: 'org/example/tool/1.2/tool-1.2.jar',
 *         source: { url: 'https://example.com/tool-1.2.jar' },
 *         // left out, the jar is downloaded once at build time and pinned
 *         integrity: { sha256: '…' },
 *       },
 *     },
 *     {
 *       name: 'org.example:local:1.0',
 *       artifact: {
 *         path: 'org/example/local/1.0/local-1.0.jar',
 *         source: { file: 'libs/local-1.0.jar' },
 *       },
 *     },
 *   ],
 * })
 * ```
 */
export interface ExtraLibrary {
  /**
   * `group:artifact:version`. The `group:artifact` of it is what decides
   * which of the version's libraries this one replaces.
   */
  name: string;
  artifact: LibraryArtifact;
}

/** A manifest {@link Artifact}, placed under the library directory. */
export type LibraryArtifact = Omit<Artifact, 'source'> & {
  /** A link to the jar, or a jar on the build machine relative to the config. */
  source: { url: string; file?: undefined } | { file: string; url?: undefined };
};

/**
 * A loader's options as its crate takes them: each library `file` made
 * absolute. A path in a config is relative to the config, and the crate has
 * no way to know where that is.
 */
export function withLibraryFiles<
  T extends { libraries?: readonly ExtraLibrary[] },
>(options: T, configDir: string): T {
  if (!options.libraries) return options;
  return {
    ...options,
    libraries: options.libraries.map((library) => {
      const { file } = library.artifact.source;
      return file === undefined || isAbsolute(file)
        ? library
        : {
            ...library,
            artifact: {
              ...library.artifact,
              source: { file: resolve(configDir, file) },
            },
          };
    }),
  };
}
