import { unzipSync } from 'fflate';
import {
  fetchClient,
  clientToTemplate,
  buildClasspath,
  buildLaunch,
  mapLibraries,
} from '../internal';
import {
  type Artifact,
  type ValDefs,
  type Launch,
  sourceUrl,
  extractScan,
  fetchWithRetry,
} from '@torba/core';
import type { Val, Valset } from '@torba/core';
import {
  parseArguments,
  parseLibraries,
  type Library,
  type MojangArgValue,
} from '@torba/mojang';
import {
  resolveCleanroomVersion,
  type CleanroomRelease,
  type ResolveCleanroomOptions,
} from './resolver';

export interface CleanroomOptions {
  /**
   * Cleanroom version. Accepts:
   *   - Exact tag: `'0.5.9-alpha'`
   *   - `'prerelease'` — newest GitHub release (Cleanroom is currently alpha-only)
   *   - `'latest'` — newest non-prerelease
   */
  version: string;
  /** GitHub repo override. Default: `CleanroomMC/Cleanroom`. */
  repo?: string;
  /** Optional GitHub token for higher rate limits while resolving releases. */
  token?: string;
}

export interface CleanroomTemplate {
  /** Vanilla MC + Cleanroom installer + bundled cleanroom jar + runtime libraries. */
  artifacts: Artifact[];
  vars: ValDefs;
  /** Assembled Launch — drop straight into `manifest.launch`. */
  launch: Launch;
  /** JVM args alone, for composition (e.g. interleaving authliberty's `-javaagent`). */
  jvmArgs: Valset;
  /** Main class wrapped as a `Val` so it spreads into a `Valset`. Raw string at `mainClass.value[0]`. */
  mainClass: Val;
  /** Game args alone, for composition. */
  gameArgs: Valset;
}

interface InstallerVersionJson {
  id: string;
  inheritsFrom: string;
  mainClass: string;
  minecraftArguments?: string;
  arguments?: { game?: unknown[]; jvm?: unknown[] };
  libraries: unknown[];
}

interface InstallerProfileJson {
  spec: number;
  profile: string;
  version: string;
  minecraft: string;
  libraries: unknown[];
}

async function fetchInstallerBytes(url: string): Promise<Uint8Array> {
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download Cleanroom installer from ${url}: ${res.status} ${res.statusText}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

function readJsonEntry<T>(zip: Record<string, Uint8Array>, name: string): T {
  const buf = zip[name];
  if (!buf) {
    throw new Error(`Cleanroom installer is missing entry '${name}'`);
  }
  return JSON.parse(new TextDecoder().decode(buf)) as T;
}

/**
 * Build a torba template that launches Minecraft with the Cleanroom loader.
 *
 * Cleanroom is structurally similar to legacy Forge: vanilla 1.12.2 + a custom
 * mainClass (`top.outlands.foundation.boot.Foundation`) + a legacy
 * `minecraftArguments` string + a flat library list. The installer JAR bundles
 * its own version.json + install_profile.json + a `maven/` tree containing the
 * cleanroom runtime jar (which has `url: ""` in version.json — sourced from
 * the `maven/` extract instead).
 */
export async function resolveCleanroom(
  options: CleanroomOptions,
): Promise<CleanroomTemplate> {
  const release = await resolveCleanroomVersion(options.version, {
    repo: options.repo,
    token: options.token,
  } satisfies ResolveCleanroomOptions);

  const installerBytes = await fetchInstallerBytes(release.installerUrl);
  const zip = unzipSync(installerBytes, {
    filter: (f) =>
      f.name === 'version.json' || f.name === 'install_profile.json',
  });
  const versionJson = readJsonEntry<InstallerVersionJson>(zip, 'version.json');
  const installProfile = readJsonEntry<InstallerProfileJson>(
    zip,
    'install_profile.json',
  );

  const vanillaId = versionJson.inheritsFrom;
  const { client } = await fetchClient(vanillaId);
  const mc = await clientToTemplate(client);

  const runtimeLibs = parseLibraries(versionJson.libraries);
  const installLibs = parseLibraries(installProfile.libraries);

  // The bundled cleanroom jar lands under `${library_directory}/<path>` via
  // the installer's `maven/` tree extraction below. Its version.json entry
  // carries `url: ""` for that reason — skip it in the download set so the
  // installer doesn't try to fetch an empty URL.
  const downloadableRuntime = runtimeLibs.filter((l) => l.artifact.url);
  const downloadableInstall = installLibs.filter((l) => l.artifact.url);

  // Cleanroom replaces most of vanilla's library set: it ships gson 2.13,
  // guava 33, lwjgl 3, log4j 2.25, etc. Vanilla 1.12.2 ships much older
  // versions of those same libraries — leaving them on the classpath wins
  // the resolution race for any class Cleanroom's version doesn't add but
  // the old version had (e.g. `org.lwjgl.Sys` from lwjgl 2.x), causing
  // Cleanroom's transforms to misfire and the JVM to load the wrong
  // implementation. Filter vanilla down to the libs Cleanroom doesn't
  // own — matches what Prism Launcher's MMC instance does via patch
  // overrides. Drop:
  //   1. Anything whose `group:artifact` overlaps with a Cleanroom lib.
  //   2. The lwjgl 2 family (`org.lwjgl.lwjgl:*`) — different group than
  //      Cleanroom's `org.lwjgl:*`, so rule 1 doesn't catch it.
  const cleanroomCoords = new Set(
    runtimeLibs.map((l) => `${l.name.groupId}:${l.name.artifactId}`),
  );
  const isShadowedByCleanroom = (lib: Library): boolean => {
    if (lib.name.groupId === 'org.lwjgl.lwjgl') return true;
    return cleanroomCoords.has(`${lib.name.groupId}:${lib.name.artifactId}`);
  };
  const keptVanillaLibs = client.libraries.filter(
    (l) => !isShadowedByCleanroom(l),
  );
  const shadowedPaths = new Set(
    client.libraries
      .filter(isShadowedByCleanroom)
      .map((l) => `\${library_directory}/${l.artifact.path}`),
  );

  const installerPath = `\${library_directory}/com/cleanroommc/cleanroom/${release.tag}/${release.installerName}`;
  const installerArtifact: Artifact = {
    path: installerPath,
    source: sourceUrl(release.installerUrl),
    size: release.installerSize,
    rules: [],
    ...(release.installerSha256
      ? { integrity: { sha256: release.installerSha256 } }
      : {}),
    extract: [
      extractScan('maven/', '${library_directory}', { strip: ['maven/'] }),
    ],
  };

  // Classpath: vanilla client.jar + Cleanroom runtime libs + the trimmed
  // vanilla side (Mojang-only stuff: codecs, authlib, realms, text2speech,
  // java-objc-bridge). Cleanroom entries go first; the trimmed vanilla
  // tail provides classes Cleanroom doesn't ship. No module-path filter,
  // no wrapper shim — Foundation does its own bootstrap.
  const cpLibs: Library[] = [...runtimeLibs, ...keptVanillaLibs];
  const libPaths = cpLibs.map((l) => ({
    rules: l.rules,
    artifactPath: `\${library_directory}/${l.artifact.path}`,
  }));
  const classpathEntries = buildClasspath(
    libPaths,
    '${version_dir}/client.jar',
  );

  const vars: ValDefs = { ...mc.vars, classpath: classpathEntries };

  // Cleanroom uses the legacy `minecraftArguments` string. parseArguments
  // turns it into game args + LEGACY_JVM_ARGS (-Djava.library.path, -cp).
  // Per legacy semantics, these REPLACE vanilla's args rather than append.
  const args = parseArguments(
    versionJson.minecraftArguments ?? versionJson.arguments ?? '',
  );

  const parts = buildLaunch(
    versionJson.mainClass,
    args.game,
    args.jvm as MojangArgValue[],
  );

  // Drop the shadowed vanilla library artifacts from the download set too.
  // (mc.artifacts also carries client.jar, asset index, and asset objects —
  // those have non-library paths, so the path-based filter leaves them in.)
  const filteredMcArtifacts = mc.artifacts.filter(
    (a) => !shadowedPaths.has(a.path),
  );

  return {
    artifacts: [
      ...filteredMcArtifacts,
      installerArtifact,
      ...mapLibraries(downloadableRuntime),
      ...mapLibraries(downloadableInstall),
    ],
    vars,
    ...parts,
  };
}
