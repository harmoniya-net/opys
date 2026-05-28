/**
 * Resolver for fuckforge index URLs.
 *
 * fuckforge layout:
 *   ${source}/versions.json                          → master index
 *   ${source}/versions/${mc}/${forgeId}.json         → per-build entry
 *   ${source}/versions/${mc}/{best,latest,recommended}.json → alias redirects
 */

import { fetchWithRetry } from '@opys/core';

export interface ForgeFile {
  readonly md5: string;
  readonly url: string;
}

export interface ForgeIndexEntry {
  readonly id: string;
  readonly forge: string;
  readonly files: Record<string, ForgeFile>;
  readonly manifest: string | null;
  readonly recipe: string | null;
  /** URL to the installer's `install_profile.json`, if available. */
  readonly installProfile?: string | null;
}

interface MasterIndex {
  versions: Record<
    string,
    {
      latest: { forge: string; url: string } | null;
      recommended: { forge: string; url: string } | null;
      best: { forge: string; url: string };
      list: { forge: string; url: string }[];
    }
  >;
}

const ALIASES = ['latest', 'recommended', 'best'] as const;
type Alias = (typeof ALIASES)[number];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * Resolves a version string against a fuckforge index and returns the per-build entry.
 *
 * Accepted forms:
 *   - Bare MC version: `1.20.1` → resolves to that MC's `best` Forge build
 *   - Alias: `1.20.1-latest` | `1.20.1-recommended` | `1.20.1-best`
 *   - Full Forge build ID: `1.20.1-47.4.20`
 */
export async function resolveForgeVersion(
  input: string,
  source: string,
): Promise<ForgeIndexEntry> {
  const base = source.replace(/\/+$/, '');
  const master = await fetchJson<MasterIndex>(`${base}/versions.json`);

  // 1. Alias suffix: <mc>-<alias>
  for (const alias of ALIASES) {
    const suffix = `-${alias}`;
    if (!input.endsWith(suffix)) continue;
    const mc = input.slice(0, -suffix.length);
    const entry = master.versions[mc];
    if (!entry) {
      throw new Error(
        `Unknown Minecraft version '${mc}' (resolving '${input}')`,
      );
    }
    const target = entry[alias as Alias];
    if (!target) {
      throw new Error(`No '${alias}' Forge build available for ${mc}`);
    }
    return await fetchJson<ForgeIndexEntry>(target.url);
  }

  // 2. Bare MC version
  if (master.versions[input]) {
    return await fetchJson<ForgeIndexEntry>(master.versions[input].best.url);
  }

  // 3. Full Forge build ID — find the longest matching MC prefix and look up in `list`
  const mcKeys = Object.keys(master.versions).sort(
    (a, b) => b.length - a.length,
  );
  for (const mc of mcKeys) {
    if (!input.startsWith(`${mc}-`)) continue;
    const found = master.versions[mc]!.list.find((b) => b.forge === input);
    if (found) return await fetchJson<ForgeIndexEntry>(found.url);
  }

  throw new Error(`Could not resolve Forge version '${input}' from ${base}`);
}
