/**
 * `@opys/minecraft-resources` — what a pack installs beside the game, kept
 * in one file.
 *
 * A TOML file lists mods, resource packs, shaders and plugins: a table per
 * side and directory, and in it a file per key. `readResources()` reads it, and `resources()`
 * makes of it a plugin for each side, which resolves that side to pinned
 * files and puts each in its directory. What an entry
 * may be, and whom each is asked of, is the `opys-minecraft-resources`
 * crate's and is tested there; this module is the typed surface over it.
 *
 * What stays here is `resources()` itself: the plugin closures, and the
 * paths made absolute, a file's own and the config's directory, which only
 * this side knows.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minecraftResources as napi } from '@opys/binding';
import {
  definePlugin,
  pluginOptions,
  type ChainablePlugin,
  type Contribution,
} from '@opys/dev';
import type { HashEntry } from '@opys/core';

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-minecraft-resources` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** Which installation a build is of. */
export type ResourceSide = 'client' | 'server';

/**
 * The directories a file may list into without saying where they are: each
 * is under the game directory, by its own name.
 */
export type BuiltInResourceDir =
  'mods' | 'resourcepacks' | 'shaderpacks' | 'plugins' | 'datapacks';

/**
 * Where an entry's file is, as a string:
 *
 * - `modrinth:<project>@<version>`, with `#<loader>` after it where one
 *   number is several versions
 * - `curseforge:<project>@<file id>`
 * - `file:<path>`, or with a trailing `/` a whole folder
 * - a link
 */
export type ResourceSourceText = string;

/** A GitHub release asset. `asset` may be left out where there is one. */
export interface GitHubResource {
  /** `owner/name`. */
  readonly repo: string;
  readonly tag: string;
  readonly asset?: string;
}

/** A file in a GitLab generic package registry. */
export interface GitLabResource {
  /** Project path (`group/name`) or numeric id. */
  readonly project: string;
  readonly package: string;
  readonly version: string;
  readonly asset: string;
  /** The instance, for a self-hosted one. Left out, it is gitlab.com. */
  readonly host?: string;
}

/** Free data, copied onto the artifact. opys reads none of it. */
export type ResourceMetadata = Readonly<Record<string, unknown>>;

/**
 * An entry of a list: its source alone, or a table for what a string
 * cannot hold. A table has exactly one of `source`, `github` and `gitlab`.
 */
export type ResourceEntry =
  | ResourceSourceText
  | {
      readonly source: ResourceSourceText;
      readonly github?: never;
      readonly gitlab?: never;
      readonly metadata?: ResourceMetadata;
    }
  | {
      readonly github: GitHubResource;
      readonly source?: never;
      readonly gitlab?: never;
      readonly metadata?: ResourceMetadata;
    }
  | {
      readonly gitlab: GitLabResource;
      readonly source?: never;
      readonly github?: never;
      readonly metadata?: ResourceMetadata;
    };

/**
 * One table of the file: for each directory, by name, its entries by key.
 * A directory is a built-in one or one `dirs` gives a path. A key is the
 * name its file is installed by: the file's extension is added to it, a
 * key with a dot is the whole name, and a folder goes into a folder of its
 * key, or with the key `.` into the directory itself.
 */
export type ResourceSection = Readonly<
  Record<string, Readonly<Record<string, ResourceEntry>>>
>;

/** A resources file, decoded. */
export interface ResourceFile {
  /**
   * The pack's own directories, name to path, and any built-in one it keeps
   * somewhere else. A path begins with a variable: `${game_directory}/…`,
   * which on a server is its root, or `${root}/…`.
   */
  readonly dirs: Readonly<Record<string, string>>;
  /** What both sides install. */
  readonly common: ResourceSection;
  readonly client: ResourceSection;
  readonly server: ResourceSection;
}

/** An entry's file, resolved: where it is, its size, and a hash. */
export interface ResolvedResource {
  /** The directory it was listed under, by name. */
  readonly dir: string;
  /** The key it was listed by. */
  readonly key: string;
  /** Where it goes in its directory: `sodium.jar`, `shared/jei/a.ini`. */
  readonly path: string;
  /** Published at a link, or on this machine and carried in the bundle. */
  readonly source: { readonly url: string } | { readonly file: string };
  /** File size in bytes. */
  readonly size: number;
  /**
   * Absent for a file from disk, which is named by its content once it is
   * carried, and for a CurseForge file published without a sha1.
   */
  readonly integrity?: HashEntry;
  /** The entry's own, as it was written. */
  readonly metadata?: ResourceMetadata;
}

/**
 * What a pack lists, as a config hands it over: the tables of a resources
 * file, each of them optional, and where they came from.
 */
export interface Resources {
  readonly dirs?: Readonly<Record<string, string>>;
  readonly common?: ResourceSection;
  readonly client?: ResourceSection;
  readonly server?: ResourceSection;
  /**
   * The directory a `file:` entry is relative to. {@link readResources}
   * sets it to the file's own. Left out, it is the config's.
   */
  readonly base?: string;
}

/** Tokens and API bases. All optional; only CurseForge needs a token. */
export interface ResourcesOptions {
  /** Required for any `curseforge:` entry: CurseForge has no anonymous API. */
  curseforgeToken?: string;
  /** Raises GitHub's rate limit for links, and reaches private repositories. */
  githubToken?: string;
  /** Reaches private GitLab projects, for links. */
  gitlabToken?: string;
  /** GitHub API base, when it is not the public one. */
  githubApi?: string;
  /** Modrinth API base, when it is not the public one. */
  modrinthApi?: string;
  /** CurseForge API base, when it is not the public one. */
  curseforgeApi?: string;
}

/** A pack's resources as plugins: one for each side. A config takes one. */
export interface ResourcePlugins {
  /** What `[common]` and `[client]` list. */
  readonly client: ChainablePlugin<'resources', never>;
  /** What `[common]` and `[server]` list. */
  readonly server: ChainablePlugin<'resources', never>;
}

// ──────────────────────────────────────────────────────────────────────────
// Reading and resolving
// ──────────────────────────────────────────────────────────────────────────

/**
 * Decode a resources file from its text. A table that is no directory or
 * no side, and an entry with no version, are refused here, before anything is asked of anyone. `path` is what an error
 * calls the file.
 */
export function parseResources(text: string, path?: string): ResourceFile {
  return napi.parseResources(text, path) as ResourceFile;
}

/**
 * Read a resources file, for {@link resources}.
 *
 * A path is relative to where the command was run, which is not always
 * where the config is. A URL is not relative to anything, so a config that
 * is to work from any directory writes
 * `readResources(new URL('resources.toml', import.meta.url))`.
 *
 * What comes back carries `base`, the file's directory, so that a `file:`
 * entry is found beside the file whatever a config does to the rest.
 */
export function readResources(file: string | URL): ResourceFile & {
  readonly base: string;
} {
  const path = file instanceof URL ? fileURLToPath(file) : resolve(file);
  const read = napi.readResources(path) as ResourceFile;
  return { ...read, base: dirname(path) };
}

/** What the crate is handed: the tables, and the base apart from them. */
function request(
  tables: Resources,
  side: ResourceSide,
  options: ResourcesOptions,
  configDir: string,
) {
  const { base, ...rest } = tables;
  return {
    ...options,
    side,
    resources: rest,
    base: base === undefined ? configDir : resolve(configDir, base),
  };
}

/**
 * Resolve one side to pinned files, in the order written. A `base` left out
 * is the working directory.
 */
export async function resolveResources(
  tables: Resources,
  side: ResourceSide,
  options: ResourcesOptions = {},
): Promise<ResolvedResource[]> {
  return (await napi.resolveResources(
    request(tables, side, options, process.cwd()),
  )) as ResolvedResource[];
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mods, resource packs, shaders and plugins, as a plugin for each side.
 *
 * ```js
 * const pack = resources(readResources('resources.toml'));
 *
 * plugins: [pack.client], // a server pack's config takes `pack.server`
 * ```
 *
 * It takes the tables and not a path, so they can as well be written here,
 * or read and then changed:
 *
 * ```js
 * resources({
 *   common: { mods: { lithium: 'modrinth:lithium@mc1.21.1-0.15.4-fabric' } },
 *   client: { mods: { sodium: 'modrinth:sodium@mc1.21.1-0.8.13-fabric' } },
 * });
 * ```
 */
export function resources(
  tables: Resources,
  options: ResourcesOptions = {},
): ResourcePlugins {
  const given = pluginOptions(
    "resources(readResources('resources.toml'))",
    tables,
  );
  const side = (side: ResourceSide) =>
    definePlugin({
      name: 'resources',
      async build(ctx) {
        const output = (await napi.buildResources(
          request(given, side, options, ctx.configDir),
        )) as { contribution: Contribution };
        const count = output.contribution.artifacts?.length ?? 0;
        ctx.log('resources', `${count} file(s) for the ${side}`);
        return output.contribution;
      },
    });
  return { client: side('client'), server: side('server') };
}
