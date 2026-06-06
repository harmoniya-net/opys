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

const FORGE_MODULE_ARGS = new Set([
  '-p',
  '--module-path',
  '--add-modules',
  '--add-reads',
  '--add-opens',
  '--add-exports',
]);

/**
 * Strip module-path-related JVM args from the merged arg list.
 * ForgeWrapper applies these programmatically via Unsafe/reflection,
 * bypassing Java 25's module system command-line incompatibilities.
 * Also removes -DignoreList since there's no module-path scanning.
 */
function stripModuleArgs(jvm: MojangArgValue[]): MojangArgValue[] {
  const result: MojangArgValue[] = [];
  let skipNext = false;
  for (const arg of jvm) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const raw = typeof arg === 'string' ? arg : '';
    if (FORGE_MODULE_ARGS.has(raw)) {
      skipNext = true;
      continue;
    }
    if (typeof raw === 'string' && raw.startsWith('-DignoreList=')) {
      continue;
    }
    result.push(arg);
  }
  return result;
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

  // ForgeWrapper: PrismLauncher's custom launcher that handles module-path
  // setup programmatically via Unsafe + MethodHandles.Lookup, bypassing
  // Java 25's module system incompatibilities with NeoForge's command-line
  // module-path args. All jars go on -cp; ForgeWrapper does the module
  // gymnastics at runtime.
  const FORGE_WRAPPER_MAIN =
    'io.github.zekerzhayard.forgewrapper.installer.Main';
  const FORGE_WRAPPER_VERSION = 'prism-2025-12-07';
  const FORGE_WRAPPER_JAR = `io/github/zekerzhayard/ForgeWrapper/${FORGE_WRAPPER_VERSION}/ForgeWrapper-${FORGE_WRAPPER_VERSION}.jar`;
  const FORGE_WRAPPER_URL = `https://files.prismlauncher.org/maven/${FORGE_WRAPPER_JAR}`;
  const FORGE_WRAPPER_SHA1 = '4c4653d80409e7e968d3e3209196ffae778b7b4e';

  // Strip module-path JVM args — ForgeWrapper applies them programmatically.
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
  libPaths.push({
    rules: [],
    artifactPath: `\${library_directory}/${FORGE_WRAPPER_JAR}`,
  });

  // ForgeWrapper system properties — tells the detector where to find the
  // installer jar, minecraft jar, and library directory.
  const forgeWrapperArgs: MojangArgValue[] = [
    `-Dforgewrapper.librariesDir=\${library_directory}`,
    `-Dforgewrapper.installer=\${library_directory}/net/neoforged/neoforge/${release.version}/neoforge-${release.version}-installer.jar`,
    '-Dforgewrapper.minecraft=${version_dir}/client.jar',
  ];
  const strippedJvm = [...forgeWrapperArgs, ...stripModuleArgs(merged.jvm)];
  const strippedGame = merged.game;

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
  const forgeWrapperArtifact: Artifact = {
    path: `\${library_directory}/${FORGE_WRAPPER_JAR}`,
    source: sourceUrl(FORGE_WRAPPER_URL),
    rules: [],
    integrity: { sha1: FORGE_WRAPPER_SHA1 },
  };

  // Only fetch libs that have a real download URL; empty-URL libs are bundled
  // in the installer's maven/ tree.
  const downloadableRuntime = runtimeLibs.filter((l) => l.artifact.url);
  const downloadableInstall = installProfileLibs.filter((l) => l.artifact.url);
  const forgeLibArtifacts = [
    ...mapLibraries(downloadableRuntime),
    ...mapLibraries(downloadableInstall),
  ];

  const vars: ValDefs = { ...mc.vars, classpath: classpathEntries };
  const parts = buildLaunch(FORGE_WRAPPER_MAIN, strippedGame, strippedJvm);

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
