import type { Artifact } from '@opys/core';
import { sourceUrl, fetchWithRetry, extractScan } from '@opys/core';
import { unzipSync } from 'fflate';
import { createHash } from 'node:crypto';
import {
  fetchCurseforgeFiles,
  parseFileRef,
  type CurseForgeFileRef,
} from './template';

/** A mod loader entry in a CurseForge modpack `manifest.json`. */
export interface CurseforgeModLoader {
  /** `<loader>-<version>`, e.g. `forge-47.4.20`, `fabric-0.15.11`. */
  id: string;
  primary?: boolean;
}

/** A file reference in a CurseForge modpack `manifest.json`. */
export interface CurseforgeManifestFile {
  projectID: number;
  fileID: number;
  required?: boolean;
}

/** The parsed `manifest.json` of a CurseForge modpack `.zip`. */
export interface CurseforgeModpackManifest {
  minecraft: { version: string; modLoaders: CurseforgeModLoader[] };
  files: CurseforgeManifestFile[];
  /** Name of the directory whose contents are copied into the instance. */
  overrides: string;
  name: string;
  version?: string;
}

/** The build-time resolution of a CurseForge modpack, before loader composition. */
export interface ResolvedCurseforgeModpack {
  manifest: CurseforgeModpackManifest;
  /** One artifact per modpack mod file, installed under `mods/`. */
  files: Artifact[];
  /** Downloads the modpack `.zip` and extracts its `overrides/` into the instance. */
  overrides: Artifact;
}

/** Which opys loader plugin a modpack maps to. */
export type LoaderSpec =
  | { loader: 'fabric'; minecraft: string; fabricLoader: string }
  | { loader: 'forge'; version: string }
  | { loader: 'neoforge'; version: string }
  | { loader: 'vanilla'; minecraft: string };

/**
 * Map a CurseForge modpack manifest to a {@link LoaderSpec}. Pure — the plugin
 * turns the spec into the matching loader factory call. The primary mod loader
 * is used (its `id` is `<loader>-<version>`).
 *
 * Quilt is rejected — opys has no Quilt loader plugin.
 */
export function loaderSpecFromManifest(
  manifest: CurseforgeModpackManifest,
): LoaderSpec {
  const minecraft = manifest.minecraft.version;
  const loaders = manifest.minecraft.modLoaders;
  const primary = loaders.find((l) => l.primary) ?? loaders[0];
  if (!primary) {
    throw new Error('CurseForge modpack manifest has no mod loader.');
  }

  const sep = primary.id.indexOf('-');
  const loader = sep === -1 ? primary.id : primary.id.slice(0, sep);
  const version = sep === -1 ? '' : primary.id.slice(sep + 1);

  switch (loader) {
    case 'forge':
      return { loader: 'forge', version: `${minecraft}-${version}` };
    case 'fabric':
      return { loader: 'fabric', minecraft, fabricLoader: version };
    case 'neoforge':
      return { loader: 'neoforge', version };
    case 'quilt':
      throw new Error(
        'Quilt modpacks are not supported — opys has no Quilt loader plugin.',
      );
    default:
      throw new Error(`Unknown CurseForge mod loader "${primary.id}".`);
  }
}

/** Read `manifest.json` out of the in-memory modpack `.zip`. */
function readManifest(bytes: Uint8Array): CurseforgeModpackManifest {
  const entries = unzipSync(bytes, {
    filter: (f) => f.name === 'manifest.json',
  });
  const raw = entries['manifest.json'];
  if (!raw) {
    throw new Error('CurseForge modpack .zip is missing manifest.json');
  }
  return JSON.parse(new TextDecoder().decode(raw)) as CurseforgeModpackManifest;
}

/**
 * Resolve a CurseForge modpack into its mod-file artifacts, an
 * overrides-extraction artifact, and the parsed manifest (loader + game
 * version live there). Does the network — resolves the modpack file, downloads
 * its `.zip`, and resolves every referenced mod file — but no loader
 * composition; the {@link curseforgeModpack} plugin layers the loader on top.
 *
 * A token is required: unlike Modrinth, every CurseForge file (the pack and
 * each mod) is looked up by ID through the authenticated API.
 */
export async function resolveCurseforgeModpack(
  options: { token: string },
  file: CurseForgeFileRef,
): Promise<ResolvedCurseforgeModpack> {
  const modpackFileId = parseFileRef(file);
  const [pack] = await fetchCurseforgeFiles(options.token, [modpackFileId]);
  if (!pack) {
    throw new Error(
      `CurseForge API did not return the modpack file ${modpackFileId}`,
    );
  }

  const res = await fetchWithRetry(pack.url);
  if (!res.ok) {
    throw new Error(
      `Failed to download CurseForge modpack: ${res.status} ${res.statusText} (${pack.url})`,
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const manifest = readManifest(bytes);

  const metas = await fetchCurseforgeFiles(
    options.token,
    manifest.files.map((f) => f.fileID),
  );
  const byId = new Map(metas.map((m) => [m.fileId, m]));

  const files: Artifact[] = manifest.files.map((f) => {
    const meta = byId.get(f.fileID);
    if (!meta) {
      throw new Error(
        `CurseForge API did not return metadata for modpack file ${f.fileID} (project ${f.projectID})`,
      );
    }
    return {
      path: `\${game_directory}/mods/${meta.filename}`,
      source: sourceUrl(meta.url),
      size: meta.size,
      rules: [],
      ...(meta.sha1 ? { integrity: { sha1: meta.sha1 } } : {}),
    };
  });

  const overridesDir = manifest.overrides || 'overrides';
  const sha1 = createHash('sha1').update(bytes).digest('hex');
  const overrides: Artifact = {
    path: '${root}/cache/curseforge-modpack.zip',
    source: sourceUrl(pack.url),
    size: bytes.length,
    rules: [],
    integrity: { sha1 },
    extract: [
      extractScan(`${overridesDir}/`, '${game_directory}', {
        strip: [`${overridesDir}/`],
      }),
    ],
  };

  return { manifest, files, overrides };
}
