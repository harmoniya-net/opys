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
import {
  FORGE_WRAPPER_MAIN,
  stripModuleArgs,
  resolveForgeWrapperArtifact,
  buildForgeWrapperJvmArgs,
  type ForgeWrapperOptions,
} from '@opys/forgewrapper';

export type { ForgeWrapperOptions };

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
  /** Override the bundled ForgeWrapper JAR (PrismLauncher fork). */
  forgeWrapper?: ForgeWrapperOptions;
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

  const { artifact: forgeWrapperArtifact, path: forgeWrapperPath } =
    resolveForgeWrapperArtifact(options.forgeWrapper ?? {});

  const neoForgeCoords = new Set(
    runtimeLibs.map((l) => `${l.name.groupId}:${l.name.artifactId}`),
  );
  const vanillaOnlyLibs = client.libraries.filter(
    (l) => !neoForgeCoords.has(`${l.name.groupId}:${l.name.artifactId}`),
  );
  // installProfileLibs (from install_profile.json) are build tool deps
  // (installertools, binarypatcher, asm-9.3, etc.) — NOT needed on the
  // game classpath. ForgeWrapper handles the install phase internally.
  // Including them would cause module conflicts (e.g. asm-9.3 vs asm-9.8
  // from the runtime version.json libs).
  const cpLibs = [...vanillaOnlyLibs, ...runtimeLibs];
  const libPaths = cpLibs.map((l) => ({
    rules: l.rules,
    artifactPath: `\${library_directory}/${l.artifact.path}`,
  }));
  libPaths.push({ rules: [], artifactPath: forgeWrapperPath });

  const classpathEntries = buildClasspath(
    libPaths,
    '${version_dir}/client.jar',
  );

  // The installer's maven/ tree contains bundled JARs (the NeoForge universal,
  // etc.) that have url:"" in version.json. Extract them into the library
  // directory so ForgeWrapper/ModLauncher can discover them.
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

  const strippedJvm = [
    ...buildForgeWrapperJvmArgs(installerPath),
    ...stripModuleArgs(merged.jvm),
  ];

  // Only fetch libs that have a real download URL; empty-URL libs are bundled
  // in the installer's maven/ tree.
  const downloadableRuntime = runtimeLibs.filter((l) => l.artifact.url);
  const downloadableInstall = installProfileLibs.filter((l) => l.artifact.url);
  const forgeLibArtifacts = [
    ...mapLibraries(downloadableRuntime),
    ...mapLibraries(downloadableInstall),
  ];

  const vars: ValDefs = { ...mc.vars, classpath: classpathEntries };
  const parts = buildLaunch(FORGE_WRAPPER_MAIN, merged.game, strippedJvm);

  return {
    artifacts: [
      ...mc.artifacts,
      ...forgeLibArtifacts,
      installerArtifact,
      forgeWrapperArtifact,
    ],
    vars,
    ...parts,
  };
}
