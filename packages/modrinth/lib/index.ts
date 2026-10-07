/**
 * `@opys/modrinth` — Modrinth mod files and `.mrpack` modpacks.
 *
 * Behaviour lives in the `opys-modrinth` crate and reaches JS through
 * `@opys/modrinth-binding`; this module is the typed surface over it. The
 * codegen'd binding types everything as `Json` (≈ `unknown`), so each wrapper
 * carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * Two things stay here because they are the host's by nature:
 *
 *  - `path` is the config author's function. The crate resolves the files,
 *    this side asks the author where each goes, and the crate builds the
 *    artifacts from the answers.
 *  - A modpack names a loader, and a loader is another plugin. The crate
 *    resolves the pack as far as a {@link LoaderSpec}; running that plugin
 *    and folding its contribution in happens here.
 *
 * No API token is needed — Modrinth's API is open and its files are public
 * CDN links.
 */

import * as napi from '@opys/modrinth-binding';
import { definePlugin, type ChainablePlugin } from '@opys/dev';
import type { Artifact } from '@opys/core';
import { minecraft } from '@opys/minecraft-vanilla';
import { fabric } from '@opys/fabric';
import { forge } from '@opys/forge';
import { neoforge } from '@opys/neoforge';

/** Modrinth's public API base. */
export const MODRINTH_API = napi.defaultModrinthApi();

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-modrinth` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** Info passed to the `path` callback. */
export interface ModrinthFileInfo {
  /** Original filename as published on Modrinth, e.g. `sodium-fabric-0.5.8.jar`. */
  readonly filename: string;
  /** Modrinth version ID (base62). */
  readonly versionId: string;
  /** Modrinth project ID (base62). */
  readonly projectId: string;
  /** Human version string, e.g. `mc1.20.1-0.5.8`. */
  readonly versionNumber: string;
  /** File size in bytes. */
  readonly size: number;
}

export type ModrinthPath = (info: ModrinthFileInfo) => string;

/**
 * A Modrinth version reference. Either a version ID (base62, e.g.
 * `JjCVwmVA`), or the version's Modrinth URL
 * (`https://modrinth.com/mod/<slug>/version/<id>`) — the segment after
 * `/version/` is parsed out so configs can paste links verbatim.
 */
export type ModrinthVersionRef = string;

export interface ModrinthOptions {
  /**
   * Install path callback, invoked once per file. May return a string
   * containing opys install-time vars like `${root}` or
   * `${game_directory}` — they get interpolated at install time.
   */
  path: ModrinthPath;
  /** Modrinth API base, when it is not the public one. */
  apiBase?: string;
}

/** Whether a file belongs on one side of the game. */
export type MrpackSide = 'required' | 'optional' | 'unsupported';

/** Per-file environment flags in a `.mrpack` index. */
export interface MrpackEnv {
  readonly client?: MrpackSide;
  readonly server?: MrpackSide;
}

/** A single file entry in `modrinth.index.json`. */
export interface MrpackFile {
  /** Install path relative to the instance, e.g. `mods/sodium.jar`. */
  readonly path: string;
  readonly hashes: { readonly sha1?: string; readonly sha512?: string };
  readonly env?: MrpackEnv;
  /** Direct download URLs (mirrors); the first is used. */
  readonly downloads: string[];
  readonly fileSize: number;
}

/** The parsed `modrinth.index.json` (format version 1). */
export interface MrpackIndex {
  readonly formatVersion: number;
  readonly game: string;
  readonly versionId: string;
  readonly name: string;
  readonly files: MrpackFile[];
  /** `minecraft` plus one of `fabric-loader` / `forge` / `neoforge` / `quilt-loader`. */
  readonly dependencies: Record<string, string>;
}

/**
 * A Modrinth modpack reference. Either a version ID (base62), the version's
 * Modrinth URL (`https://modrinth.com/modpack/<slug>/version/<id>`), or a
 * direct `.mrpack` URL.
 */
export type ModrinthModpackRef = string;

/** Which opys loader plugin a modpack maps to. */
export type LoaderSpec =
  | { loader: 'fabric'; minecraft: string; fabricLoader: string }
  | { loader: 'forge'; version: string }
  | { loader: 'neoforge'; version: string }
  | { loader: 'vanilla'; minecraft: string };

/** The build-time resolution of a modpack, before the loader is composed. */
export interface ResolvedModpack {
  readonly index: MrpackIndex;
  /** `dependencies` from the index — the game + loader versions. */
  readonly dependencies: Record<string, string>;
  /** The loader those dependencies ask for. */
  readonly loader: LoaderSpec;
  /** One artifact per client-side modpack file (mods, resourcepacks, …). */
  readonly files: Artifact[];
  /** Downloads the `.mrpack` and extracts its `overrides/` into the instance. */
  readonly overrides: Artifact;
}

// ──────────────────────────────────────────────────────────────────────────
// Mod files
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve Modrinth version refs into opys `Artifact`s. Each version
 * contributes its primary file, placed where `options.path` says. Call it
 * once per destination (mods, resourcepacks, shaderpacks, …).
 *
 * ```ts
 * const mods = await resolveModrinth(
 *   { path: (info) => '${game_directory}/mods/' + info.filename },
 *   ['JjCVwmVA', 'https://modrinth.com/mod/sodium/version/JjCVwmVA'],
 * );
 * ```
 */
export async function resolveModrinth(
  options: ModrinthOptions,
  versions: ModrinthVersionRef[],
): Promise<Artifact[]> {
  const files = (await napi.resolveModrinthFiles(
    versions,
    options.apiBase ?? MODRINTH_API,
  )) as ModrinthFileInfo[];
  // The one step that has to happen here: the author's function, per file.
  const paths = files.map((file) => options.path(file));
  return napi.modrinthFileArtifacts(files, paths) as Artifact[];
}

/** Options for the {@link modrinth} plugin. */
export interface ModrinthPluginOptions extends ModrinthOptions {
  /** Modrinth version references — version IDs or `/version/<id>` URLs. */
  versions: ModrinthVersionRef[];
}

/** Mod files resolved from the Modrinth API. */
export function modrinth(options: ModrinthPluginOptions): ChainablePlugin {
  return definePlugin({
    name: 'modrinth',
    async build(ctx) {
      const { versions, ...rest } = options;
      const artifacts = await resolveModrinth(rest, versions);
      ctx.log('modrinth', `${artifacts.length} file(s)`);
      return { artifacts };
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Modpacks
// ──────────────────────────────────────────────────────────────────────────

/**
 * Map a `.mrpack`'s `dependencies` to a {@link LoaderSpec}. Quilt is
 * rejected — opys has no Quilt loader plugin.
 */
export function loaderSpec(dependencies: Record<string, string>): LoaderSpec {
  return napi.loaderSpec(dependencies) as LoaderSpec;
}

/**
 * Resolve a Modrinth modpack into its client-side file artifacts, an
 * overrides-extraction artifact, and the loader it asks for. No loader is
 * composed — {@link modrinthModpack} layers that on top.
 *
 * The `.mrpack` is downloaded once here to read its index; the runtime
 * downloads it again (as the overrides artifact's source) at install time.
 */
export async function resolveModrinthModpack(
  ref: ModrinthModpackRef,
  options: { apiBase?: string } = {},
): Promise<ResolvedModpack> {
  return (await napi.resolveModrinthModpack(
    ref,
    options.apiBase ?? MODRINTH_API,
  )) as ResolvedModpack;
}

/** The opys loader plugin a {@link LoaderSpec} stands for, with its defaults. */
function loaderPlugin(spec: LoaderSpec): ChainablePlugin {
  switch (spec.loader) {
    case 'fabric':
      return fabric(spec.minecraft, { loader: spec.fabricLoader });
    case 'forge':
      return forge(spec.version);
    case 'neoforge':
      return neoforge(spec.version);
    case 'vanilla':
      return minecraft(spec.minecraft);
  }
}

/** Options for the {@link modrinthModpack} plugin. */
export interface ModrinthModpackOptions {
  /** Modrinth API base, when it is not the public one. */
  apiBase?: string;
  /**
   * How to stand up the pack's loader. Defaults to the matching opys plugin
   * with its own defaults; pass this to give it options of your own — a
   * mirror for the document index, say.
   */
  loader?: (spec: LoaderSpec) => ChainablePlugin;
}

/**
 * All-in-one Modrinth modpack plugin. Detects the game version and mod loader
 * from the pack's `modrinth.index.json`, stands up the matching loader (which
 * already bundles vanilla), installs every client-side modpack file, and
 * extracts the pack's `overrides/`. The loader's launch groups (`command`,
 * `jvmArgs`, `mainClass`, `gameArgs`) are re-exposed under this one plugin, so
 * a config wires it identically regardless of which loader the pack uses:
 *
 * ```js
 * plugins: [modrinthModpack('xVcA1pSL'), java('17')],
 * manifest: {
 *   command: ({ modrinthModpack }) => modrinthModpack.command,
 *   args: ({ modrinthModpack }) => [
 *     modrinthModpack.jvmArgs,
 *     modrinthModpack.mainClass,
 *     modrinthModpack.gameArgs,
 *   ],
 *   workdir: '${game_directory}',
 * },
 * ```
 *
 * Java is intentionally left out — add `java(...)` separately (the `.mrpack`
 * format does not pin a JDK).
 */
export function modrinthModpack(
  ref: ModrinthModpackRef,
  options: ModrinthModpackOptions = {},
): ChainablePlugin {
  return definePlugin({
    name: 'modrinthModpack',
    async build(ctx) {
      const pack = await resolveModrinthModpack(ref, options);
      const loader = (options.loader ?? loaderPlugin)(pack.loader);
      const base = await loader.build(ctx);

      ctx.log(
        'modrinthModpack',
        `${pack.index.name} — ${loader.name} + ${pack.files.length} file(s)`,
      );

      return {
        artifacts: [...(base.artifacts ?? []), ...pack.files, pack.overrides],
        vars: base.vars,
        launch: base.launch,
        envs: base.envs,
      };
    },
  });
}
