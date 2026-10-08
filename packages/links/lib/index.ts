/**
 * `@opys/links` — a link, turned into an artifact.
 *
 * Paste the URL you already have: a release asset on GitHub, a file in a
 * GitLab package registry, a mod's page on Modrinth or CurseForge, or just an
 * address a file is served from. Each resolves, at build time, to a concrete
 * download with its size and a hash — from the provider where it publishes
 * one, and by downloading and hashing the file where nobody does.
 *
 * Behaviour lives in the `opys-links` crate and reaches JS through
 * `@opys/links-binding`; this module is the typed surface over it. The
 * codegen'd binding types everything as `Json` (≈ `unknown`), so each wrapper
 * carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * What stays here is the config author's `to` function. The crate resolves
 * the files, this side asks where each goes, and the crate builds the
 * artifacts from the answers.
 */

import * as napi from '@opys/links-binding';
import { definePlugin, type ChainablePlugin } from '@opys/dev';
import type { Artifact, HashEntry } from '@opys/core';

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-links` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** Where a file was resolved. `url` means no provider: the link was the file. */
export type LinkProvider =
  'github' | 'gitlab' | 'modrinth' | 'curseforge' | 'url';

/** A link, resolved: a concrete download with its size and a hash. */
export interface ResolvedFile {
  /** The link as it was given. */
  readonly link: string;
  readonly provider: LinkProvider;
  readonly filename: string;
  /**
   * Where the file is downloaded from. Not always the link: a `latest` link
   * resolves to the release it meant, and a mod's page to the file behind it.
   */
  readonly url: string;
  /** File size in bytes. */
  readonly size: number;
  /** Absent only for a CurseForge file published without a sha1. */
  readonly integrity?: HashEntry;
}

/** Tokens and API bases. All optional; only CurseForge needs a token. */
export interface LinkOptions {
  /** Raises GitHub's rate limit, and reaches private repositories. */
  githubToken?: string;
  /** Reaches private GitLab projects. */
  gitlabToken?: string;
  /** Required for any CurseForge link — CurseForge has no anonymous API. */
  curseforgeToken?: string;
  /** GitHub API base, when it is not the public one. */
  githubApi?: string;
  /** Modrinth API base, when it is not the public one. */
  modrinthApi?: string;
  /** CurseForge API base, when it is not the public one. */
  curseforgeApi?: string;
}

/**
 * Where a file goes: a function of the resolved file, or — for a single link
 * — the path itself. May contain install-time vars like `${game_directory}`.
 */
export type LinkPath = (file: ResolvedFile) => string;

// ──────────────────────────────────────────────────────────────────────────
// Resolving
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve links to pinned files, in the order given. Recognised:
 *
 * - `github.com/<owner>/<repo>/releases/download/<tag>/<asset>`
 * - `github.com/<owner>/<repo>/releases/latest/download/<asset>` — pinned to
 *   whichever release is latest when the manifest is built
 * - `<gitlab>/api/v4/projects/<project>/packages/generic/<pkg>/<version>/<file>`
 * - `modrinth.com/…/version/<id>`
 * - `curseforge.com/…/files/<id>` (needs `curseforgeToken`)
 *
 * Any other URL is taken as the file itself, downloaded once and hashed.
 */
export async function resolveLinks(
  links: string[],
  options: LinkOptions = {},
): Promise<ResolvedFile[]> {
  return (await napi.resolveLinks(links, options)) as ResolvedFile[];
}

/**
 * Resolve links into opys `Artifact`s, each placed where `to` says.
 *
 * ```ts
 * const mods = await resolveLinkArtifacts(
 *   [
 *     'https://modrinth.com/mod/sodium/version/JjCVwmVA',
 *     'https://github.com/o/r/releases/latest/download/mod.jar',
 *   ],
 *   { to: (file) => '${game_directory}/mods/' + file.filename },
 * );
 * ```
 */
export async function resolveLinkArtifacts(
  links: string[],
  options: LinkOptions & { to: LinkPath },
): Promise<Artifact[]> {
  const { to, ...rest } = options;
  const files = await resolveLinks(links, rest);
  // The one step that has to happen here: the author's function, per file.
  return napi.linkFileArtifacts(files, files.map(to)) as Artifact[];
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

/** Options for the {@link links} plugin. */
export interface LinksPluginOptions extends LinkOptions {
  /** Where each resolved file is installed. */
  to: LinkPath;
  /** The links to resolve. */
  links: string[];
}

/**
 * Files named by link. Use it once per destination:
 *
 * ```js
 * plugins: [
 *   links({
 *     to: (file) => '${game_directory}/mods/' + file.filename,
 *     links: [
 *       'https://modrinth.com/mod/sodium/version/JjCVwmVA',
 *       'https://www.curseforge.com/minecraft/mc-mods/jei/files/6307712',
 *     ],
 *     curseforgeToken: process.env.CURSEFORGE_TOKEN,
 *   }),
 * ],
 * ```
 */
export function links(
  options: LinksPluginOptions,
): ChainablePlugin<'links', never> {
  return definePlugin({
    name: 'links',
    async build(ctx) {
      const { links: urls, ...rest } = options;
      const artifacts = await resolveLinkArtifacts(urls, rest);
      ctx.log('links', `${artifacts.length} file(s)`);
      return { artifacts };
    },
  });
}
