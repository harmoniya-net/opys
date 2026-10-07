/**
 * `@opys/curseforge` — CurseForge mod files and modpack archives.
 *
 * Behaviour lives in the `opys-curseforge` crate and reaches JS through
 * `@opys/curseforge-binding`; this module is the typed surface over it. The
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
 * Everything needs an API key (https://console.curseforge.com/#/api-keys): a
 * file is only ever found by id, through the authenticated API. The key is
 * used at build time only — the URLs it resolves to are public CDN links, so
 * a built manifest installs without one.
 */

import * as napi from '@opys/curseforge-binding';
import { definePlugin, type ChainablePlugin } from '@opys/dev';
import type { Artifact } from '@opys/core';
import { minecraft } from '@opys/minecraft-vanilla';
import { fabric } from '@opys/fabric';
import { forge } from '@opys/forge';
import { neoforge } from '@opys/neoforge';

/** CurseForge's public API base. */
export const CURSEFORGE_API = napi.defaultCurseforgeApi();

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-curseforge` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** Info passed to the `path` callback. */
export interface CurseForgeFileInfo {
  /** Original filename as published on CurseForge, e.g. `jei-1.20.1-forge-15.21.1.5.jar`. */
  readonly filename: string;
  /** CurseForge file ID. */
  readonly fileId: number;
  /** CurseForge project (mod) ID. */
  readonly projectId: number;
  /** File size in bytes. */
  readonly size: number;
}

/** A resolved file — the download URL is already settled. */
export interface CurseForgeFileMeta extends CurseForgeFileInfo {
  /** Download URL: the API's, or the forgecdn address when it gave none. */
  readonly url: string;
  readonly sha1?: string;
}

export type CurseForgePath = (info: CurseForgeFileInfo) => string;

/**
 * A CurseForge file reference. Either a numeric file ID, or the file's
 * CurseForge URL (`https://www.curseforge.com/<...>/files/<id>`) — the
 * trailing numeric segment is parsed out so configs can paste links
 * verbatim.
 */
export type CurseForgeFileRef = number | string;

/** Where and as whom to ask. */
export interface CurseForgeApiOptions {
  /**
   * CurseForge API key. Consumed only at build time — end users running a
   * built manifest do not need one.
   */
  token: string;
  /** CurseForge API base, when it is not the public one. */
  apiBase?: string;
}

export interface CurseForgeOptions extends CurseForgeApiOptions {
  /**
   * Install path callback, invoked once per file. May return a string
   * containing opys install-time vars like `${root}` or
   * `${game_directory}` — they get interpolated at install time.
   */
  path: CurseForgePath;
}

/** A mod loader entry in a CurseForge modpack `manifest.json`. */
export interface CurseforgeModLoader {
  /** `<loader>-<version>`, e.g. `forge-47.4.20`, `fabric-0.15.11`. */
  readonly id: string;
  readonly primary?: boolean;
}

/** A file reference in a CurseForge modpack `manifest.json`. */
export interface CurseforgeManifestFile {
  readonly projectID: number;
  readonly fileID: number;
  readonly required?: boolean;
}

/** The parsed `manifest.json` of a CurseForge modpack `.zip`. */
export interface CurseforgeModpackManifest {
  readonly minecraft: {
    readonly version: string;
    readonly modLoaders: CurseforgeModLoader[];
  };
  readonly files: CurseforgeManifestFile[];
  /** Name of the directory whose contents are copied into the instance. */
  readonly overrides: string;
  readonly name: string;
  readonly version?: string;
}

/** Which opys loader plugin a modpack maps to. */
export type LoaderSpec =
  | { loader: 'fabric'; minecraft: string; fabricLoader: string }
  | { loader: 'forge'; version: string }
  | { loader: 'neoforge'; version: string }
  | { loader: 'vanilla'; minecraft: string };

/** The build-time resolution of a CurseForge modpack, before loader composition. */
export interface ResolvedCurseforgeModpack {
  readonly manifest: CurseforgeModpackManifest;
  /** The loader the manifest asks for. */
  readonly loader: LoaderSpec;
  /** One artifact per modpack mod file, installed under `mods/`. */
  readonly files: Artifact[];
  /** Downloads the modpack `.zip` and extracts its `overrides/` into the instance. */
  readonly overrides: Artifact;
}

// ──────────────────────────────────────────────────────────────────────────
// Mod files
// ──────────────────────────────────────────────────────────────────────────

/** The file ID a reference names — the number itself, or the one in its URL. */
export function parseFileRef(ref: CurseForgeFileRef): number {
  return napi.parseFileRef(ref);
}

/**
 * Fetch metadata for CurseForge file IDs in batched calls. The order of the
 * result follows the API, not the input, and an ID it does not know is simply
 * absent — look up by `fileId`.
 */
export async function fetchCurseforgeFiles(
  token: string,
  fileIds: number[],
  apiBase: string = CURSEFORGE_API,
): Promise<CurseForgeFileMeta[]> {
  return (await napi.fetchCurseforgeFiles(
    token,
    fileIds,
    apiBase,
  )) as CurseForgeFileMeta[];
}

/**
 * Resolve CurseForge file refs into opys `Artifact`s, each placed where
 * `options.path` says. Call it once per destination (mods, resourcepacks,
 * shaderpacks, …).
 *
 * ```ts
 * const mods = await resolveCurseforge(
 *   {
 *     path: (info) => '${game_directory}/mods/' + info.filename,
 *     token: process.env.CURSEFORGE_API_KEY,
 *   },
 *   [6307712, 'https://www.curseforge.com/minecraft/mc-mods/botania/files/2283837'],
 * );
 * ```
 */
export async function resolveCurseforge(
  options: CurseForgeOptions,
  files: CurseForgeFileRef[],
): Promise<Artifact[]> {
  const metas = (await napi.resolveCurseforgeFiles(
    options.token,
    files,
    options.apiBase ?? CURSEFORGE_API,
  )) as CurseForgeFileMeta[];
  // The one step that has to happen here: the author's function, per file.
  const paths = metas.map(({ filename, fileId, projectId, size }) =>
    options.path({ filename, fileId, projectId, size }),
  );
  return napi.curseforgeFileArtifacts(metas, paths) as Artifact[];
}

/** Options for the {@link curseforge} plugin. */
export interface CurseforgePluginOptions extends CurseForgeOptions {
  /** CurseForge file references — numeric IDs or `/files/<id>` URLs. */
  files: CurseForgeFileRef[];
}

/** Mod files resolved from the CurseForge API. */
export function curseforge(options: CurseforgePluginOptions): ChainablePlugin {
  return definePlugin({
    name: 'curseforge',
    async build(ctx) {
      const { files, ...rest } = options;
      const artifacts = await resolveCurseforge(rest, files);
      ctx.log('curseforge', `${artifacts.length} file(s)`);
      return { artifacts };
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Modpacks
// ──────────────────────────────────────────────────────────────────────────

/**
 * Map a CurseForge modpack manifest to a {@link LoaderSpec}, from its primary
 * mod loader. Quilt is rejected — opys has no Quilt loader plugin.
 */
export function loaderSpecFromManifest(
  manifest: CurseforgeModpackManifest,
): LoaderSpec {
  return napi.loaderSpecFromManifest(manifest) as LoaderSpec;
}

/**
 * Resolve a CurseForge modpack into its mod-file artifacts, an
 * overrides-extraction artifact, the parsed manifest, and the loader it asks
 * for. No loader is composed — {@link curseforgeModpack} layers that on top.
 */
export async function resolveCurseforgeModpack(
  options: CurseForgeApiOptions,
  file: CurseForgeFileRef,
): Promise<ResolvedCurseforgeModpack> {
  return (await napi.resolveCurseforgeModpack(
    options.token,
    file,
    options.apiBase ?? CURSEFORGE_API,
  )) as ResolvedCurseforgeModpack;
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

/** Options for the {@link curseforgeModpack} plugin. */
export interface CurseforgeModpackOptions extends CurseForgeApiOptions {
  /** The modpack's CurseForge file reference — a numeric ID or `/files/<id>` URL. */
  file: CurseForgeFileRef;
  /**
   * How to stand up the pack's loader. Defaults to the matching opys plugin
   * with its own defaults; pass this to give it options of your own.
   */
  loader?: (spec: LoaderSpec) => ChainablePlugin;
}

/**
 * All-in-one CurseForge modpack plugin. Detects the game version and mod
 * loader from the pack's `manifest.json`, stands up the matching loader (which
 * already bundles vanilla), installs every modpack mod file, and extracts the
 * pack's `overrides/`. The loader's launch groups (`command`, `jvmArgs`,
 * `mainClass`, `gameArgs`) are re-exposed under this one plugin, so a config
 * wires it identically regardless of which loader the pack uses:
 *
 * ```js
 * plugins: [curseforgeModpack({ token, file: 1040985 }), java('17')],
 * manifest: {
 *   command: ({ curseforgeModpack }) => curseforgeModpack.command,
 *   args: ({ curseforgeModpack }) => [
 *     curseforgeModpack.jvmArgs,
 *     curseforgeModpack.mainClass,
 *     curseforgeModpack.gameArgs,
 *   ],
 *   workdir: '${game_directory}',
 * },
 * ```
 *
 * Java is intentionally left out — add `java(...)` separately (the manifest
 * does not pin a JDK).
 */
export function curseforgeModpack(
  options: CurseforgeModpackOptions,
): ChainablePlugin {
  return definePlugin({
    name: 'curseforgeModpack',
    async build(ctx) {
      const pack = await resolveCurseforgeModpack(options, options.file);
      const loader = (options.loader ?? loaderPlugin)(pack.loader);
      const base = await loader.build(ctx);

      ctx.log(
        'curseforgeModpack',
        `${pack.manifest.name} — ${loader.name} + ${pack.files.length} file(s)`,
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
