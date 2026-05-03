import type { Artifact, HashEntry } from '@torba/core';
import { sourceUrl } from '@torba/core';

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

/** Info passed to the per-file `path` callback. */
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

export interface CurseForgeFile {
  /** CurseForge file ID. */
  fileId: number;
  /** Install path for this file. May include torba install-time vars like `${root}`. */
  path: CurseForgePath;
}

export interface CurseForgeOptions {
  /**
   * CurseForge API key. Create one at https://console.curseforge.com/#/api-keys.
   * Used at build time only — the artifact URLs are public CDN links and
   * downloads do not require the key.
   */
  key: string;
  /** Files to install. */
  files: CurseForgeFile[];
}

export interface CurseForgeTemplate {
  /** One artifact per resolved file, in the order given by `files`. */
  artifacts: Artifact[];
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

async function fetchFiles(key: string, fileIds: number[]): Promise<CFFile[]> {
  const out: CFFile[] = [];
  for (let i = 0; i < fileIds.length; i += FILES_BATCH_SIZE) {
    const batch = fileIds.slice(i, i + FILES_BATCH_SIZE);
    const res = await fetch(`${CURSEFORGE_API}/mods/files`, {
      method: 'POST',
      headers: {
        'x-api-key': key,
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

export async function curseforge(
  options: CurseForgeOptions,
): Promise<CurseForgeTemplate> {
  const ids = options.files.map((f) => f.fileId);
  const meta = await fetchFiles(options.key, ids);
  const byId = new Map(meta.map((m) => [m.id, m]));

  const artifacts: Artifact[] = [];
  for (const entry of options.files) {
    const file = byId.get(entry.fileId);
    if (!file) {
      throw new Error(
        `CurseForge API did not return metadata for file ${entry.fileId}`,
      );
    }

    const path = entry.path({
      filename: file.fileName,
      fileId: file.id,
      projectId: file.modId,
      size: file.fileLength,
    });

    const url = file.downloadUrl ?? forgeCdnUrl(file.id, file.fileName);
    const sha1 = pickSha1(file);
    const integrity: HashEntry | undefined = sha1 ? { sha1 } : undefined;

    artifacts.push({
      path,
      source: sourceUrl(url),
      size: file.fileLength,
      rules: [],
      integrity,
    });
  }

  return { artifacts };
}
