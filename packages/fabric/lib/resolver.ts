/**
 * Resolver for Fabric loader versions from the Fabric Meta API.
 *
 * Meta layout (v2):
 *   ${meta}/v2/versions/loader/${game}                       → loader builds for a MC version
 *   ${meta}/v2/versions/loader/${game}/${loader}/profile/json → the launcher profile JSON
 *
 * Unlike Forge/NeoForge, the Fabric loader version is independent of the
 * Minecraft version, so the two are kept separate: `version` is always the
 * Minecraft (game) version and the loader is an explicit option. When the
 * loader is omitted we ask the Meta API for the newest build that targets the
 * given game version (preferring `stable` builds).
 */

import { fetchWithRetry } from '@opys/core';

export const DEFAULT_FABRIC_META = 'https://meta.fabricmc.net';

export interface FabricRelease {
  /** Minecraft (game) version, e.g. `1.21.4`. */
  readonly gameVersion: string;
  /** Fabric loader version, e.g. `0.16.10`. */
  readonly loaderVersion: string;
  /** Direct URL to the launcher profile JSON on the Meta API. */
  readonly profileUrl: string;
}

/** One entry of `${meta}/v2/versions/loader/${game}` — only the bits we read. */
interface LoaderEntry {
  loader: { version: string; stable?: boolean };
}

function buildProfileUrl(base: string, game: string, loader: string): string {
  return `${base}/v2/versions/loader/${game}/${loader}/profile/json`;
}

async function fetchLoaderBuilds(
  base: string,
  game: string,
): Promise<LoaderEntry[]> {
  const url = `${base}/v2/versions/loader/${game}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as LoaderEntry[];
}

/**
 * Resolve a game version (and optional loader) to a concrete Fabric release.
 *
 * - With an explicit `loader`, no Meta lookup is needed — the profile URL is
 *   built directly.
 * - Without one, the newest loader build for `game` is selected; `stable`
 *   builds win over pre-releases, and the list is returned newest-first so the
 *   first match is the latest.
 */
export async function resolveFabricVersion(
  game: string,
  meta: string,
  loader?: string,
): Promise<FabricRelease> {
  const base = meta.replace(/\/+$/, '');

  if (loader) {
    return {
      gameVersion: game,
      loaderVersion: loader,
      profileUrl: buildProfileUrl(base, game, loader),
    };
  }

  const builds = await fetchLoaderBuilds(base, game);
  if (builds.length === 0) {
    throw new Error(`No Fabric loader build found for Minecraft '${game}'`);
  }

  // Meta lists builds newest-first; prefer a stable build, else the newest.
  const chosen = builds.find((b) => b.loader.stable) ?? builds[0]!;
  const loaderVersion = chosen.loader.version;

  return {
    gameVersion: game,
    loaderVersion,
    profileUrl: buildProfileUrl(base, game, loaderVersion),
  };
}
