import type { Artifact, HashEntry } from '@opys/core';
import { sourceUrl, fetchWithRetry } from '@opys/core';

const MODRINTH_API = 'https://api.modrinth.com/v2';
const VERSIONS_BATCH_SIZE = 100;

/** A file attached to a Modrinth version, as returned by the v2 API. */
interface MRFile {
  hashes: { sha1?: string; sha512?: string };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

/** A Modrinth version, as returned by the v2 API. */
interface MRVersion {
  id: string;
  project_id: string;
  version_number: string;
  files: MRFile[];
}

/** Info passed to the `path` callback. */
export interface ModrinthFileInfo {
  /** Original filename as published on Modrinth, e.g. `sodium-fabric-0.5.8.jar`. */
  filename: string;
  /** Modrinth version ID (base62). */
  versionId: string;
  /** Modrinth project ID (base62). */
  projectId: string;
  /** Human version string, e.g. `mc1.20.1-0.5.8`. */
  versionNumber: string;
  /** File size in bytes. */
  size: number;
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
}

/**
 * Coerce a `ModrinthVersionRef` into a version ID. A `/version/<id>` segment
 * (the standard Modrinth version URL shape) is parsed out; a bare string is
 * taken as the ID verbatim; any other URL is rejected.
 */
function parseVersionRef(ref: ModrinthVersionRef): string {
  const match = ref.match(/\/version\/([^/?#]+)/);
  if (match) return match[1]!;
  if (ref.includes('://')) {
    throw new Error(
      `Modrinth version ref "${ref}" does not contain "/version/<id>" — expected a version ID or a Modrinth version URL.`,
    );
  }
  return ref;
}

/** The primary file of a version, falling back to the first file listed. */
function pickFile(version: MRVersion): MRFile | undefined {
  return version.files.find((f) => f.primary) ?? version.files[0];
}

async function fetchVersions(ids: string[]): Promise<MRVersion[]> {
  const out: MRVersion[] = [];
  for (let i = 0; i < ids.length; i += VERSIONS_BATCH_SIZE) {
    const batch = ids.slice(i, i + VERSIONS_BATCH_SIZE);
    const query = encodeURIComponent(JSON.stringify(batch));
    const res = await fetchWithRetry(`${MODRINTH_API}/versions?ids=${query}`);
    if (!res.ok) {
      throw new Error(
        `Modrinth API ${res.status}: ${res.statusText} (GET /versions)`,
      );
    }
    const json = (await res.json()) as MRVersion[];
    out.push(...json);
  }
  return out;
}

/**
 * Resolve Modrinth version refs into opys `Artifact`s sharing one install
 * path. Each version contributes its primary file. Call multiple times for
 * different destinations (mods, resourcepacks, shaderpacks, …) and drop each
 * result straight into your manifest's `artifacts` list.
 *
 * No API token is required — Modrinth's API is open and the artifact URLs
 * are public CDN links.
 *
 * ```ts
 * const mods = await resolveModrinth(
 *   { path: (info) => '${game_directory}/mods/' + info.filename },
 *   [
 *     'JjCVwmVA',
 *     'https://modrinth.com/mod/sodium/version/JjCVwmVA',
 *   ],
 * );
 * // mods: Artifact[]
 * ```
 */
export async function resolveModrinth(
  options: ModrinthOptions,
  versions: ModrinthVersionRef[],
): Promise<Artifact[]> {
  const ids = versions.map(parseVersionRef);
  const meta = await fetchVersions(ids);
  const byId = new Map(meta.map((m) => [m.id, m]));

  const artifacts: Artifact[] = [];
  for (const id of ids) {
    const version = byId.get(id);
    if (!version) {
      throw new Error(`Modrinth API did not return metadata for version ${id}`);
    }

    const file = pickFile(version);
    if (!file) {
      throw new Error(`Modrinth version ${id} has no downloadable files`);
    }

    const path = options.path({
      filename: file.filename,
      versionId: version.id,
      projectId: version.project_id,
      versionNumber: version.version_number,
      size: file.size,
    });

    const integrity: HashEntry | undefined = file.hashes.sha1
      ? { sha1: file.hashes.sha1 }
      : undefined;

    artifacts.push({
      path,
      source: sourceUrl(file.url),
      size: file.size,
      rules: [],
      integrity,
    });
  }

  return artifacts;
}
