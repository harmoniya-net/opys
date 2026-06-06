/**
 * Resolver for NeoForge versions from the official NeoForge Maven repository.
 *
 * Maven layout:
 *   ${source}/net/neoforged/neoforge/maven-metadata.xml   → version list
 *   ${source}/net/neoforged/neoforge/${v}/neoforge-${v}-installer.jar
 *   ${source}/net/neoforged/neoforge/${v}/neoforge-${v}-installer.jar.sha1
 *
 * Accepted version forms:
 *   - Bare NeoForge version: `20.4.80-beta` or `21.1.172` (exact, no Maven lookup)
 *   - Bare MC version: `1.20.4` → latest NeoForge build for that MC
 *   - MC alias: `1.20.4-latest` → same as bare MC
 *
 * NeoForge version ↔ MC version mapping:
 *   `{major}.{minor}.{patch}` → MC `1.{major}.{minor}`  (e.g. 20.4.80 → 1.20.4)
 *   `{major}.0.{patch}`       → MC `1.{major}`           (e.g. 21.0.5 → 1.21)
 */

import { fetchWithRetry } from '@opys/core';

export const DEFAULT_NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases';

export interface NeoForgeRelease {
  /** NeoForge version string, e.g. `20.4.80-beta` or `21.1.172`. */
  readonly version: string;
  /** Corresponding Minecraft version, e.g. `1.20.4` or `1.21.1`. */
  readonly mcVersion: string;
  /** Direct URL to the installer JAR on Maven. */
  readonly installerUrl: string;
  /** URL to the installer JAR's sha1 checksum file on Maven. */
  readonly sha1Url: string;
}

/** Derive the Minecraft version from a NeoForge version string. */
export function nfVersionToMc(v: string): string {
  const m = v.match(/^(\d+)\.(\d+)\./);
  if (!m) throw new Error(`Cannot parse NeoForge version string: '${v}'`);
  const [, major, minor] = m;
  return +minor! === 0 ? `1.${major}` : `1.${major}.${minor}`;
}

function buildInstallerUrl(base: string, version: string): string {
  return `${base}/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`;
}

async function fetchVersionList(base: string): Promise<string[]> {
  const url = `${base}/net/neoforged/neoforge/maven-metadata.xml`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  // Maven metadata lists versions oldest-first; reverse so index 0 is newest.
  return [...xml.matchAll(/<version>([^<]+)<\/version>/g)]
    .map((m) => m[1]!)
    .reverse();
}

/**
 * Resolves a version string to a specific NeoForge release.
 */
export async function resolveNeoForgeVersion(
  input: string,
  source: string,
): Promise<NeoForgeRelease> {
  const base = source.replace(/\/+$/, '');

  // MC versions always start with '1.' (e.g. '1.20.4', '1.21.1', '1.20.4-latest').
  // Everything else is treated as an exact NeoForge version ('20.4.80-beta', '21.1.172').
  if (!input.startsWith('1.')) {
    const mcVersion = nfVersionToMc(input);
    const installerUrl = buildInstallerUrl(base, input);
    return {
      version: input,
      mcVersion,
      installerUrl,
      sha1Url: `${installerUrl}.sha1`,
    };
  }

  // MC version (with optional `-latest` alias): resolve to newest NeoForge for that MC.
  let mcTarget = input;
  if (mcTarget.endsWith('-latest')) {
    mcTarget = mcTarget.slice(0, -'-latest'.length);
  }

  const versions = await fetchVersionList(base);
  const candidates = versions.filter((v) => {
    try {
      return nfVersionToMc(v) === mcTarget;
    } catch {
      return false;
    }
  });

  if (candidates.length === 0) {
    throw new Error(
      `No NeoForge version found for Minecraft '${mcTarget}' (resolving '${input}')`,
    );
  }

  const version = candidates[0]!;
  const installerUrl = buildInstallerUrl(base, version);
  return {
    version,
    mcVersion: mcTarget,
    installerUrl,
    sha1Url: `${installerUrl}.sha1`,
  };
}
