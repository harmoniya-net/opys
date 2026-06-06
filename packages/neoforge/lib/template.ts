import { unzipSync } from 'fflate';
import {
  fetchClient,
  clientToTemplate,
  buildClasspath,
  buildLaunch,
  mapLibraries,
} from '@opys/minecraft-vanilla';
import {
  type Artifact,
  type ValDefs,
  type Launch,
  sourceUrl,
  extractScan,
  fetchWithRetry,
} from '@opys/core';
import type { Val, Valset } from '@opys/core';
import {
  mergeArgs,
  parseArguments,
  parseLibraries,
  type Arguments,
  type MojangArgValue,
} from '@opys/mojang';
import {
  resolveNeoForgeVersion,
  DEFAULT_NEOFORGE_MAVEN,
  type NeoForgeRelease,
} from './resolver';

export interface NeoForgeOptions {
  /**
   * NeoForge version. Accepts:
   *   - Bare NeoForge version: `20.4.80-beta` or `21.1.172`
   *   - Bare MC version: `1.20.4` → latest NeoForge for that MC
   *   - MC alias: `1.20.4-latest`
   */
  version: string;
  /** NeoForge Maven base URL. Default: `https://maven.neoforged.net/releases`. */
  source?: string;
}

export interface NeoForgeTemplate {
  /** Vanilla MC + NeoForge runtime libraries + installer artifact. */
  artifacts: Artifact[];
  vars: ValDefs;
  /** Assembled Launch — drop straight into `manifest.launch`. */
  launch: Launch;
  /** JVM args alone, for composition (e.g. interleaving authliberty's `-javaagent`). */
  jvmArgs: Valset;
  /** Main class wrapped as a `Val` so it spreads into a `Valset`. */
  mainClass: Val;
  /** Game args alone, for composition. */
  gameArgs: Valset;
}

interface InstallerVersionJson {
  id: string;
  inheritsFrom: string;
  mainClass: string;
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
      `Failed to download NeoForge installer from ${url}: ${res.status} ${res.statusText}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchInstallerSha1(url: string): Promise<string | undefined> {
  const res = await fetchWithRetry(url);
  if (!res.ok) return undefined;
  // sha1 files contain the hash followed by optional whitespace/filename
  return (await res.text()).trim().split(/\s/)[0];
}

function readJsonEntry<T>(zip: Record<string, Uint8Array>, name: string): T {
  const buf = zip[name];
  if (!buf) throw new Error(`NeoForge installer is missing entry '${name}'`);
  return JSON.parse(new TextDecoder().decode(buf)) as T;
}

/**
 * Extract artifact paths on the Java module path (-p) from parsed args.
 * These jars must NOT appear on -cp or the JVM module system breaks.
 */
function modulePathArtifacts(args: Arguments): Set<string> {
  const flat: string[] = [];
  for (const arg of args.jvm) {
    if (typeof arg === 'string') flat.push(arg);
    else flat.push(...(Array.isArray(arg.value) ? arg.value : [arg.value]));
  }
  const artifacts = new Set<string>();
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] === '-p' || flat[i] === '--module-path') {
      const pathStr = flat[++i];
      if (!pathStr) continue;
      for (const jar of pathStr.split(/[:;]/)) {
        const m = jar.match(/^\$\{library_directory\}\/(.+)$/);
        if (m?.[1]) artifacts.add(m[1]);
      }
    }
  }
  return artifacts;
}

function fixPath(s: string): string {
  return s.replace(/\.\.\/libraries\//g, '${library_directory}/');
}

function fixArg(arg: MojangArgValue): MojangArgValue {
  if (typeof arg === 'string') return fixPath(arg);
  const value = Array.isArray(arg.value)
    ? arg.value.map(fixPath)
    : fixPath(arg.value);
  return { ...arg, value };
}

function fixArgs(args: Arguments): Arguments {
  return { ...args, jvm: args.jvm.map(fixArg) };
}

export async function resolveNeoForge(
  options: NeoForgeOptions,
): Promise<NeoForgeTemplate> {
  const source = options.source ?? DEFAULT_NEOFORGE_MAVEN;
  const release = await resolveNeoForgeVersion(options.version, source);

  const [installerBytes, installerSha1] = await Promise.all([
    fetchInstallerBytes(release.installerUrl),
    fetchInstallerSha1(release.sha1Url),
  ]);

  const zip = unzipSync(installerBytes, {
    filter: (f) =>
      f.name === 'version.json' || f.name === 'install_profile.json',
  });

  const versionJson = readJsonEntry<InstallerVersionJson>(zip, 'version.json');
  const installProfile = readJsonEntry<InstallerProfileJson>(
    zip,
    'install_profile.json',
  );

  const { client } = await fetchClient(versionJson.inheritsFrom);
  const mc = await clientToTemplate(client);

  const runtimeLibs = parseLibraries(versionJson.libraries);
  const installProfileLibs = parseLibraries(installProfile.libraries);

  const nfArgs = fixArgs(
    parseArguments(versionJson.arguments ?? { game: [], jvm: [] }),
  );
  const merged = mergeArgs(client.args, nfArgs);
  const onModulePath = modulePathArtifacts(merged);

  // The installer's maven/ tree contains bundled JARs (the NeoForge universal,
  // etc.) that have url:"" in version.json. Extract them into the library
  // directory so BootstrapLauncher can discover them via -DlibraryDirectory.
  const installerPath =
    `\${library_directory}/net/neoforged/neoforge/${release.version}` +
    `/neoforge-${release.version}-installer.jar`;
  const installerArtifact: Artifact = {
    path: installerPath,
    source: sourceUrl(release.installerUrl),
    rules: [],
    ...(installerSha1 ? { integrity: { sha1: installerSha1 } } : {}),
    extract: [
      extractScan('maven/', '${library_directory}', { strip: ['maven/'] }),
    ],
  };

  // Only fetch libs that have a real download URL; empty-URL libs are bundled
  // in the installer's maven/ tree and will be covered by the extract above.
  const downloadableRuntime = runtimeLibs.filter((l) => l.artifact.url);
  const downloadableInstall = installProfileLibs.filter((l) => l.artifact.url);

  const forgeLibArtifacts = [
    ...mapLibraries(downloadableRuntime),
    ...mapLibraries(downloadableInstall),
  ];

  // Classpath: vanilla libs + NeoForge runtime libs, minus anything on -p.
  const cpLibs = [...client.libraries, ...runtimeLibs];
  const libPaths = cpLibs
    .filter((l) => !onModulePath.has(l.artifact.path))
    .map((l) => ({
      rules: l.rules,
      artifactPath: `\${library_directory}/${l.artifact.path}`,
    }));

  const classpathEntries = buildClasspath(
    libPaths,
    '${version_dir}/client.jar',
  );

  const vars: ValDefs = { ...mc.vars, classpath: classpathEntries };
  const parts = buildLaunch(versionJson.mainClass, merged.game, merged.jvm);

  return {
    artifacts: [...mc.artifacts, ...forgeLibArtifacts, installerArtifact],
    vars,
    ...parts,
  };
}
