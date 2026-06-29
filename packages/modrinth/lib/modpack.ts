import type { Artifact } from '@opys/core';
import { sourceUrl, fetchWithRetry, extractScan } from '@opys/core';
import { unzipSync } from 'fflate';
import { createHash } from 'node:crypto';

const MODRINTH_API = 'https://api.modrinth.com/v2';

/** Per-file environment flags in a `.mrpack` index. */
export interface MrpackEnv {
  client?: 'required' | 'optional' | 'unsupported';
  server?: 'required' | 'optional' | 'unsupported';
}

/** A single file entry in `modrinth.index.json`. */
export interface MrpackFile {
  /** Install path relative to the instance, e.g. `mods/sodium.jar`. */
  path: string;
  hashes: { sha1?: string; sha512?: string };
  env?: MrpackEnv;
  /** Direct download URLs (mirrors); the first is used. */
  downloads: string[];
  fileSize: number;
}

/** The parsed `modrinth.index.json` (format version 1). */
export interface MrpackIndex {
  formatVersion: number;
  game: string;
  versionId: string;
  name: string;
  files: MrpackFile[];
  /** `minecraft` plus one of `fabric-loader` / `forge` / `neoforge` / `quilt-loader`. */
  dependencies: Record<string, string>;
}

/**
 * A Modrinth modpack reference. Either a version ID (base62), the version's
 * Modrinth URL (`https://modrinth.com/modpack/<slug>/version/<id>`), or a
 * direct `.mrpack` URL.
 */
export type ModrinthModpackRef = string;

/** The build-time resolution of a modpack, before the loader is composed. */
export interface ResolvedModpack {
  index: MrpackIndex;
  /** `dependencies` from the index — the game + loader versions. */
  dependencies: Record<string, string>;
  /** One artifact per client-side modpack file (mods, resourcepacks, …). */
  files: Artifact[];
  /** Downloads the `.mrpack` and extracts its `overrides/` into the instance. */
  overrides: Artifact;
}

/** Which opys loader plugin a `.mrpack`'s dependencies map to. */
export type LoaderSpec =
  | { loader: 'fabric'; minecraft: string; fabricLoader: string }
  | { loader: 'forge'; version: string }
  | { loader: 'neoforge'; version: string }
  | { loader: 'vanilla'; minecraft: string };

/**
 * Map a `.mrpack`'s `dependencies` to a {@link LoaderSpec}. Pure — the plugin
 * turns the spec into the matching loader factory call.
 *
 * - `fabric-loader` → `fabric(minecraft, { loader })`
 * - `forge`         → `forge('<minecraft>-<forge>')`
 * - `neoforge`      → `neoforge('<neoforge>')` (derives its own MC version)
 * - none            → `minecraft('<minecraft>')` (a vanilla modpack)
 *
 * Quilt is rejected — opys has no Quilt loader plugin.
 */
export function loaderSpec(dependencies: Record<string, string>): LoaderSpec {
  const minecraft = dependencies.minecraft;
  if (!minecraft) {
    throw new Error(
      'Modrinth modpack index is missing its "minecraft" dependency.',
    );
  }
  const fabricLoader = dependencies['fabric-loader'];
  if (fabricLoader) return { loader: 'fabric', minecraft, fabricLoader };
  if (dependencies['forge']) {
    return {
      loader: 'forge',
      version: `${minecraft}-${dependencies['forge']}`,
    };
  }
  if (dependencies['neoforge']) {
    return { loader: 'neoforge', version: dependencies['neoforge'] };
  }
  if (dependencies['quilt-loader']) {
    throw new Error(
      'Quilt modpacks are not supported — opys has no Quilt loader plugin.',
    );
  }
  return { loader: 'vanilla', minecraft };
}

/** A file is installed on a client unless it is explicitly `unsupported`. */
function includeForClient(file: MrpackFile): boolean {
  return file.env?.client !== 'unsupported';
}

function parseModpackRef(
  ref: ModrinthModpackRef,
): { kind: 'url'; url: string } | { kind: 'version'; id: string } {
  if (ref.endsWith('.mrpack') || ref.includes('cdn.modrinth.com')) {
    return { kind: 'url', url: ref };
  }
  const match = ref.match(/\/version\/([^/?#]+)/);
  if (match) return { kind: 'version', id: match[1]! };
  if (ref.includes('://')) {
    throw new Error(
      `Modrinth modpack ref "${ref}" is a URL but neither a .mrpack file nor a /version/<id> link.`,
    );
  }
  return { kind: 'version', id: ref };
}

interface MRVersionFile {
  url: string;
  filename: string;
  primary: boolean;
}

/** Resolve a modpack ref to the downloadable `.mrpack` URL. */
async function resolveMrpackUrl(ref: ModrinthModpackRef): Promise<string> {
  const parsed = parseModpackRef(ref);
  if (parsed.kind === 'url') return parsed.url;

  const res = await fetchWithRetry(`${MODRINTH_API}/version/${parsed.id}`);
  if (!res.ok) {
    throw new Error(
      `Modrinth API ${res.status}: ${res.statusText} (GET /version/${parsed.id})`,
    );
  }
  const version = (await res.json()) as { files: MRVersionFile[] };
  const file =
    version.files.find((f) => f.filename.endsWith('.mrpack') && f.primary) ??
    version.files.find((f) => f.filename.endsWith('.mrpack'));
  if (!file) {
    throw new Error(
      `Modrinth version ${parsed.id} has no .mrpack file — is it a modpack?`,
    );
  }
  return file.url;
}

/** Read `modrinth.index.json` out of the in-memory `.mrpack` zip. */
function readIndex(bytes: Uint8Array): MrpackIndex {
  const entries = unzipSync(bytes, {
    filter: (f) => f.name === 'modrinth.index.json',
  });
  const raw = entries['modrinth.index.json'];
  if (!raw) {
    throw new Error('.mrpack archive is missing modrinth.index.json');
  }
  return JSON.parse(new TextDecoder().decode(raw)) as MrpackIndex;
}

/**
 * Resolve a Modrinth modpack into its client-side file artifacts, an
 * overrides-extraction artifact, and the loader/game `dependencies`. Does the
 * network (Modrinth API + `.mrpack` download) but no loader composition — the
 * {@link modrinthModpack} plugin layers the loader on top.
 *
 * The `.mrpack` is downloaded once here to read its index; the runtime
 * re-downloads it (as the overrides artifact's source) to extract `overrides/`
 * at install time.
 */
export async function resolveModrinthModpack(
  ref: ModrinthModpackRef,
): Promise<ResolvedModpack> {
  const mrpackUrl = await resolveMrpackUrl(ref);

  const res = await fetchWithRetry(mrpackUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download .mrpack: ${res.status} ${res.statusText} (${mrpackUrl})`,
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const index = readIndex(bytes);

  const files: Artifact[] = index.files.filter(includeForClient).map((f) => {
    const url = f.downloads[0];
    if (!url) {
      throw new Error(`Modrinth modpack file "${f.path}" has no download URL.`);
    }
    return {
      path: `\${game_directory}/${f.path}`,
      source: sourceUrl(url),
      size: f.fileSize,
      rules: [],
      ...(f.hashes.sha1 ? { integrity: { sha1: f.hashes.sha1 } } : {}),
    };
  });

  const sha1 = createHash('sha1').update(bytes).digest('hex');
  const overrides: Artifact = {
    path: '${root}/cache/modrinth-modpack.mrpack',
    source: sourceUrl(mrpackUrl),
    size: bytes.length,
    rules: [],
    integrity: { sha1 },
    // `overrides/` ships to every side; `client-overrides/` is client-only.
    extract: [
      extractScan('overrides/', '${game_directory}', { strip: ['overrides/'] }),
      extractScan('client-overrides/', '${game_directory}', {
        strip: ['client-overrides/'],
      }),
    ],
  };

  return { index, dependencies: index.dependencies, files, overrides };
}
