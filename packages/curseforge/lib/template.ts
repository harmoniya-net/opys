import type { Artifact, HashEntry } from '@opys/core';
import { sourceUrl, fetchWithRetry } from '@opys/core';

const CURSEFORGE_API = 'https://api.curseforge.com/v1';
const FILES_BATCH_SIZE = 200;

/** CurseForge file metadata returned by the v1 API. */
interface CFFile {
  id: number;
  modId: number;
  fileName: string;
  fileLength: number;
  hashes: { value: string; algo: number }[];
  downloadUrl: string | null;
}

/** Info passed to the `path` callback. */
export interface CurseForgeFileInfo {
  /** Original filename as published on CurseForge, e.g. `jei-1.20.1-forge-15.21.1.5.jar`. */
  filename: string;
  /** CurseForge file ID. */
  fileId: number;
  /** CurseForge project (mod) ID. */
  projectId: number;
  /** File size in bytes. */
  size: number;
}

export type CurseForgePath = (info: CurseForgeFileInfo) => string;

/**
 * A CurseForge file reference. Either a numeric file ID, or the file's
 * CurseForge URL (`https://www.curseforge.com/<...>/files/<id>`) — the
 * trailing numeric segment is parsed out so configs can paste links
 * verbatim.
 */
export type CurseForgeFileRef = number | string;

export interface CurseForgeOptions {
  /**
   * Install path callback, invoked once per file. May return a string
   * containing opys install-time vars like `${root}` or
   * `${game_directory}` — they get interpolated at install time.
   */
  path: CurseForgePath;
  /**
   * CurseForge API key (https://console.curseforge.com/#/api-keys).
   * Consumed only at build time — the artifact URLs are public CDN
   * links, so end users running `opys launch` against a built manifest
   * do not need a key.
   */
  token: string;
}

/** Decoded CurseForge file metadata — the download URL is already resolved. */
export interface CurseForgeFileMeta {
  fileId: number;
  projectId: number;
  filename: string;
  size: number;
  /** Resolved download URL (the API value, or a forgecdn fallback). */
  url: string;
  sha1?: string;
}

/** Fallback CDN URL used when CurseForge omits `downloadUrl`. */
function forgeCdnUrl(fileId: number, fileName: string): string {
  const head = Math.floor(fileId / 1000);
  const tail = fileId % 1000;
  return `https://edge.forgecdn.net/files/${head}/${tail}/${encodeURIComponent(fileName)}`;
}

function pickSha1(file: CFFile): string | undefined {
  return file.hashes.find((h) => h.algo === 1)?.value;
}

/**
 * Coerce a `CurseForgeFileRef` into a numeric file ID. Numbers pass through;
 * strings must contain a `/files/<digits>` segment (the standard CurseForge
 * file URL shape).
 */
export function parseFileRef(ref: CurseForgeFileRef): number {
  if (typeof ref === 'number') return ref;
  const match = ref.match(/\/files\/(\d+)/);
  if (!match) {
    throw new Error(
      `CurseForge file ref "${ref}" does not contain "/files/<id>" — expected a numeric ID or a CurseForge file URL.`,
    );
  }
  return Number(match[1]);
}

async function fetchFiles(token: string, fileIds: number[]): Promise<CFFile[]> {
  const out: CFFile[] = [];
  for (let i = 0; i < fileIds.length; i += FILES_BATCH_SIZE) {
    const batch = fileIds.slice(i, i + FILES_BATCH_SIZE);
    const res = await fetchWithRetry(`${CURSEFORGE_API}/mods/files`, {
      method: 'POST',
      headers: {
        'x-api-key': token,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fileIds: batch }),
    });
    if (!res.ok) {
      throw new Error(
        `CurseForge API ${res.status}: ${res.statusText} (POST /mods/files)`,
      );
    }
    const json = (await res.json()) as { data: CFFile[] };
    out.push(...json.data);
  }
  return out;
}

/**
 * Fetch decoded metadata for CurseForge file IDs in one batched call,
 * resolving each download URL (with a forgecdn fallback when the API omits
 * it). The order of the result follows the API, not the input — look up by
 * `fileId`.
 */
export async function fetchCurseforgeFiles(
  token: string,
  fileIds: number[],
): Promise<CurseForgeFileMeta[]> {
  const files = await fetchFiles(token, fileIds);
  return files.map((file) => ({
    fileId: file.id,
    projectId: file.modId,
    filename: file.fileName,
    size: file.fileLength,
    url: file.downloadUrl ?? forgeCdnUrl(file.id, file.fileName),
    sha1: pickSha1(file),
  }));
}

/**
 * Resolve CurseForge file refs into opys `Artifact`s sharing one install
 * path. Call multiple times for different destinations (mods,
 * resourcepacks, shaderpacks, …) and drop each result straight into your
 * manifest's `artifacts` list.
 *
 * ```ts
 * const mods = await resolveCurseforge(
 *   {
 *     path: (info) => '${game_directory}/mods/' + info.filename,
 *     token: process.env.CURSEFORGE_API_KEY,
 *   },
 *   [
 *     6307712,
 *     'https://www.curseforge.com/minecraft/mc-mods/botania/files/2283837',
 *   ],
 * );
 * // mods: Artifact[]
 * ```
 */
export async function resolveCurseforge(
  options: CurseForgeOptions,
  files: CurseForgeFileRef[],
): Promise<Artifact[]> {
  const ids = files.map(parseFileRef);
  const metas = await fetchCurseforgeFiles(options.token, ids);
  const byId = new Map(metas.map((m) => [m.fileId, m]));

  const artifacts: Artifact[] = [];
  for (const fileId of ids) {
    const meta = byId.get(fileId);
    if (!meta) {
      throw new Error(
        `CurseForge API did not return metadata for file ${fileId}`,
      );
    }

    const path = options.path({
      filename: meta.filename,
      fileId: meta.fileId,
      projectId: meta.projectId,
      size: meta.size,
    });

    const integrity: HashEntry | undefined = meta.sha1
      ? { sha1: meta.sha1 }
      : undefined;

    artifacts.push({
      path,
      source: sourceUrl(meta.url),
      size: meta.size,
      rules: [],
      integrity,
    });
  }

  return artifacts;
}
