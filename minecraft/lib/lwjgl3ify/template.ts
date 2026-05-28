import { clientToTemplate } from '../internal';
import {
  type Artifact,
  type ValDefs,
  type Launch,
  type ConditionalVal,
  sourceUrl,
  fetchWithRetry,
} from '@opys/core';
import type { Val, Valset } from '@opys/core';
import { parseClient, parseMaven, type MavenCoord } from '@opys/mojang';
import {
  resolveLwjgl3ifyVersion,
  type Lwjgl3ifyRelease,
  type ResolveLwjgl3ifyOptions,
} from './resolver';
import { assetSha256, listReleases, type RawRelease } from '../github';

const UNIMIXINS_DEFAULT_REPO = 'LegacyModdingMC/UniMixins';

interface UnimixinsAsset {
  url: string;
  size: number;
  sha256?: string;
  filename: string;
}

/**
 * Resolve UniMixins's `+unimixins-all-1.7.10-<v>.jar` asset from GitHub
 * Releases. UniMixins is the required mixin runtime for lwjgl3ify — its
 * GTNHMixins module exports `com.gtnewhorizon.gtnhmixins.IEarlyMixinLoader`,
 * which lwjgl3ify's coremod implements.
 */
async function resolveUnimixins(
  version: string,
  repo: string,
  token: string | undefined,
): Promise<UnimixinsAsset> {
  const releases = await listReleases(repo, token);
  const usable = releases.filter((r) => !r.draft);
  let target: RawRelease | undefined;
  if (version === 'latest') {
    target = usable.find((r) => !r.prerelease);
  } else if (version === 'prerelease') {
    target = usable[0];
  } else {
    target = usable.find((r) => r.tag_name === version);
  }
  if (!target) {
    throw new Error(`UniMixins release '${version}' not found in ${repo}`);
  }
  const asset = target.assets.find(
    (a) =>
      /^\+unimixins-all-1\.7\.10-.+\.jar$/.test(a.name) &&
      !a.name.includes('-dev'),
  );
  if (!asset) {
    throw new Error(
      `No \`+unimixins-all-1.7.10-*.jar\` asset on UniMixins release ${target.tag_name}`,
    );
  }
  return {
    url: asset.browser_download_url,
    size: asset.size,
    sha256: assetSha256(asset),
    filename: asset.name,
  };
}

export interface UnimixinsOptions {
  /** Tag, `'latest'`, or `'prerelease'`. Default `'latest'`. */
  version?: string;
  /** GitHub repo override. Default: `LegacyModdingMC/UniMixins`. */
  repo?: string;
}

export interface Lwjgl3ifyOptions {
  /**
   * lwjgl3ify version. Accepts:
   *   - Exact tag: `'3.0.16'`
   *   - `'latest'` — newest non-prerelease GitHub release
   *   - `'prerelease'` — newest including prereleases
   */
  version: string;
  /** GitHub repo override. Default: `GTNewHorizons/lwjgl3ify`. */
  repo?: string;
  /** Optional GitHub token for higher rate limits while resolving releases. */
  token?: string;
  /**
   * UniMixins runtime. Required for lwjgl3ify to load (its coremod
   * implements `com.gtnewhorizon.gtnhmixins.IEarlyMixinLoader`).
   * Set to `false` to opt out (e.g. you'll deploy a different mixin
   * runtime via your own mod-folder pipeline).
   */
  unimixins?: UnimixinsOptions | false;
}

export interface Lwjgl3ifyTemplate {
  /** Vanilla 1.7.10 client + asset index + assets + libraries (Mojang + Forge + lwjgl3ify + lwjgl3). */
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

/** Maven coord with `version` required. */
type ResolvedCoord = MavenCoord & { version: string };

/**
 * Build a maven path from a coord: `<group_path>/<artifact>/<version>/<artifact>-<version>[-<classifier>].jar`.
 */
function mavenPath(c: ResolvedCoord): string {
  const groupPath = c.groupId.replace(/\./g, '/');
  const ext = c.packaging ?? 'jar';
  const filename = c.classifier
    ? `${c.artifactId}-${c.version}-${c.classifier}.${ext}`
    : `${c.artifactId}-${c.version}.${ext}`;
  return `${groupPath}/${c.artifactId}/${c.version}/${filename}`;
}

interface RepoLib {
  /** Library coord. */
  readonly coord: ResolvedCoord;
  /** Path under `${library_directory}` (and inside the repo). */
  readonly path: string;
  /** Fully resolved download URL. */
  readonly url: string;
}

/**
 * Collect "repo-style" lwjgl3ify libraries — entries whose top-level `url` is
 * a maven repo base and which have no `downloads.artifact` populated.
 * `parseLibraries` (the strict Mojang schema) silently drops these; we
 * resurrect them here and build URLs from `coord + repo`.
 *
 * No sha1/size is available from upstream for these — emit them without
 * integrity rather than block on a HEAD-request pass. Forge mavens and
 * Mojang's libraries.minecraft.net are stable enough that this is fine.
 */
function collectRepoLibs(rawLibraries: unknown): RepoLib[] {
  if (!Array.isArray(rawLibraries)) return [];
  const out: RepoLib[] = [];
  for (const raw of rawLibraries) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = r.name;
    const repo = r.url;
    if (typeof name !== 'string' || typeof repo !== 'string' || !repo) continue;
    const downloads = r.downloads as Record<string, unknown> | undefined;
    if (downloads?.artifact) continue;
    if (downloads?.classifiers) continue;
    if (r.natives) continue;
    let coord: MavenCoord;
    try {
      coord = parseMaven(name);
    } catch {
      continue;
    }
    if (!coord.version) continue;
    const path = mavenPath(coord as ResolvedCoord);
    const base = repo.endsWith('/') ? repo : `${repo}/`;
    out.push({
      coord: coord as ResolvedCoord,
      path,
      url: `${base}${path}`,
    });
  }
  return out;
}

function repoLibToArtifact(lib: RepoLib): Artifact {
  return {
    path: `\${library_directory}/${lib.path}`,
    source: sourceUrl(lib.url),
    rules: [],
  };
}

/**
 * Massage lwjgl3ify's library entries so the strict Mojang schema accepts
 * them. Two known shapes need patching:
 *
 *  1. **Path-less artifact**: 122+ LWJGL 3.4 SNAPSHOT entries carry
 *     `downloads.artifact` with `url`/`sha1`/`size` but **no `path`**.
 *     Synthesize `path` from the URL — the maven path begins at the first
 *     occurrence of `<groupPath>/` in the URL (group derived from the
 *     coord). Schema then accepts the entry.
 *
 *  2. **No `downloads` block**: 15 "repo-style" entries have `name` +
 *     top-level `url` (a maven repo base) and **no `downloads` field at
 *     all**. The Mojang schema requires `downloads` to be an object;
 *     stub in `downloads: {}` so the schema passes. `parseLibraries` then
 *     silently skips them (no `artifact`, no `classifiers`, no `natives`)
 *     — `collectRepoLibs` resurrects them on the side.
 */
function patchLibraries(rawLibraries: unknown): unknown[] {
  if (!Array.isArray(rawLibraries)) return [];
  return rawLibraries.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const r = raw as Record<string, unknown>;
    let dl = r.downloads as Record<string, unknown> | undefined;
    if (dl === undefined) {
      dl = {};
    }
    const art = dl.artifact as Record<string, unknown> | undefined;
    if (art && typeof art.path !== 'string' && typeof art.url === 'string') {
      const name = r.name;
      if (typeof name === 'string') {
        let coord: MavenCoord | null = null;
        try {
          coord = parseMaven(name);
        } catch {
          coord = null;
        }
        if (coord) {
          const groupPath = coord.groupId.replace(/\./g, '/');
          const idx = art.url.indexOf(`/${groupPath}/`);
          if (idx >= 0) {
            const path = art.url.substring(idx + 1);
            return {
              ...r,
              downloads: { ...dl, artifact: { ...art, path } },
            };
          }
        }
      }
    }
    if (dl !== r.downloads) return { ...r, downloads: dl };
    return raw;
  });
}

/**
 * Append repo-lib paths onto each conditional classpath entry. The conditional
 * entries are per-OS strings of the form
 * `client.jar${classpath_separator}<lib1>${classpath_separator}…`; we just
 * extend each one with the same set of lib paths (repo libs have no rules).
 */
function augmentClasspath(
  base: ConditionalVal[],
  repoLibs: RepoLib[],
): ConditionalVal[] {
  if (repoLibs.length === 0) return base;
  const suffix = repoLibs
    .map((l) => `\${classpath_separator}\${library_directory}/${l.path}`)
    .join('');
  return base.map((arm) => ({ ...arm, value: arm.value + suffix }));
}

/**
 * Build a opys template that launches Minecraft 1.7.10 under lwjgl3ify
 * (LWJGL 3 + modern Java runtime via RetroFuturaBootstrap, with Forge
 * 1.7.10's classes patched for Java 9+ compatibility).
 *
 * The lwjgl3ify GitHub release ships a self-contained Mojang-format
 * `version.json` (no `inheritsFrom`) — we feed it through
 * `parseClient` + `clientToTemplate` for the well-formed parts and add
 * the 15 repo-style libraries (forgePatches, forge:universal, scala/akka,
 * lzma, guava 17) that the strict Mojang schema drops.
 */
export async function resolveLwjgl3ify(
  options: Lwjgl3ifyOptions,
): Promise<Lwjgl3ifyTemplate> {
  const release = await resolveLwjgl3ifyVersion(options.version, {
    repo: options.repo,
    token: options.token,
  } satisfies ResolveLwjgl3ifyOptions);

  const res = await fetchWithRetry(release.versionJson.url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch lwjgl3ify version.json from ${release.versionJson.url}: ${res.status} ${res.statusText}`,
    );
  }
  const raw = (await res.json()) as { libraries?: unknown };

  // lwjgl3ify's manifest is mostly Mojang-format, but a handful of entries
  // need massaging before the strict schema accepts them — see
  // `patchLibraries` for the details.
  const patchedLibraries = patchLibraries(raw.libraries);
  const patchedRaw = { ...raw, libraries: patchedLibraries };

  const client = parseClient(patchedRaw);
  const mc = await clientToTemplate(client);

  const repoLibs = collectRepoLibs(patchedLibraries);
  const repoArtifacts = repoLibs.map(repoLibToArtifact);

  // The lwjgl3ify mod jar carries the RFB plugin that registers the Pack200
  // redirect transformer (and the rest of the runtime patching for FML on
  // modern Java). RetroFuturaBootstrap's PluginLoader scans
  // `${game_directory}/mods/` for RFB plugin descriptors at startup, so the
  // jar must land there before launch. The MMC bundle leaves this to the
  // user; we deploy it automatically.
  const lwjgl3ifyModArtifact: Artifact = {
    path: `\${game_directory}/mods/${release.modJar.name}`,
    source: sourceUrl(release.modJar.url),
    size: release.modJar.size,
    rules: [],
    ...(release.modJar.sha256
      ? { integrity: { sha256: release.modJar.sha256 } }
      : {}),
  };

  // UniMixins is a hard runtime dep of lwjgl3ify — its GTNHMixins module
  // provides `com.gtnewhorizon.gtnhmixins.IEarlyMixinLoader`, which
  // lwjgl3ify's coremod implements. Without it, FML's CoreModManager
  // throws NoClassDefFoundError when loading lwjgl3ify as a coremod. The
  // upstream MMC bundle expects users to drop it into mods/ themselves;
  // we resolve and deploy it from the LegacyModdingMC GitHub release.
  const modArtifacts: Artifact[] = [lwjgl3ifyModArtifact];
  if (options.unimixins !== false) {
    const um = options.unimixins ?? {};
    const umAsset = await resolveUnimixins(
      um.version ?? 'latest',
      um.repo ?? UNIMIXINS_DEFAULT_REPO,
      options.token,
    );
    modArtifacts.push({
      path: `\${game_directory}/mods/${umAsset.filename}`,
      source: sourceUrl(umAsset.url),
      size: umAsset.size,
      rules: [],
      ...(umAsset.sha256 ? { integrity: { sha256: umAsset.sha256 } } : {}),
    });
  }

  const augmentedCp = augmentClasspath(mc.classpath, repoLibs);

  return {
    artifacts: [...mc.artifacts, ...repoArtifacts, ...modArtifacts],
    vars: { ...mc.vars, classpath: augmentedCp },
    launch: mc.launch,
    jvmArgs: mc.jvmArgs,
    mainClass: mc.mainClass,
    gameArgs: mc.gameArgs,
  };
}
