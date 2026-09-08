/**
 * `@opys/minecraft-vanilla` — vanilla Minecraft as manifest artifacts.
 *
 * Behaviour lives in the `opys-minecraft-vanilla` crate and reaches JS through
 * `@opys/minecraft-vanilla-binding`; this module is the typed surface over it.
 * The codegen'd binding types everything as `Json` (≈ `unknown`), so each
 * wrapper carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * What stays here is the half that cannot cross: `minecraft()` is a closure
 * the build engine calls with a `BuildContext`, so the plugin wrapper — and
 * its `ctx.log` — is JS. Everything it wraps is one native call.
 *
 * The mappers are exported because they are the shared half of the loader
 * family: forge, neoforge, fabric, cleanroom and lwjgl3ify each resolve a
 * version JSON their own way and then reuse the same classpath, launch and
 * library mapping.
 */

import * as napi from '@opys/minecraft-vanilla-binding';
import { definePlugin, launchGroups, type ChainablePlugin } from '@opys/dev';
import type {
  Artifact,
  ConditionalVal,
  Launch,
  MojangRuleset,
  Val,
  ValDefs,
  Valset,
} from '@opys/core';
import type {
  AssetIndex,
  AssetManifest,
  Client,
  Library,
  MojangArgValue,
  Version,
  VersionManifest,
} from '@opys/mojang';

export { VERSION_MANIFEST_URL } from '@opys/mojang';

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-minecraft-vanilla` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** What to resolve. `version` omitted takes the manifest's current release. */
export interface MinecraftOptions {
  readonly version?: string;
  /**
   * URL of the version manifest, when it is not Mojang's own — a mirror, or a
   * stand-in server under test.
   */
  readonly manifestBase?: string;
}

/**
 * One classpath candidate: where the jar lands, and the rules that decide
 * whether it lands at all. Loaders build these from their own library sets —
 * forge prepends its runtime libs to vanilla's — which is why the input is
 * this pair rather than a `Library`.
 */
export interface ClasspathEntry {
  readonly rules?: MojangRuleset;
  readonly artifactPath: string;
}

/**
 * Decomposed parts of a Minecraft {@link Launch}. `launch` is the assembled
 * value (drop straight into `manifest.launch`); the rest expose the JVM args,
 * main class and game args separately so callers can interleave their own JVM
 * args — an auth `-javaagent`, say — before the main class.
 */
export interface LaunchParts {
  readonly launch: Launch;
  readonly jvmArgs: Valset;
  readonly mainClass: Val;
  readonly gameArgs: Valset;
}

/** Everything a vanilla version JSON contributes to a manifest. */
export interface MinecraftTemplate extends LaunchParts {
  readonly artifacts: Artifact[];
  readonly vars: ValDefs;
  /**
   * Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
   * loader can rebuild the classpath with its own libraries prepended.
   */
  readonly classpath: ConditionalVal[];
}

/** A version-manifest entry and the version JSON it points at. */
export interface FetchedClient {
  readonly version: Version;
  readonly client: Client;
}

// ──────────────────────────────────────────────────────────────────────────
// Network
// ──────────────────────────────────────────────────────────────────────────

/** Resolve vanilla Minecraft — version JSON, libraries, assets and launch. */
export async function resolveMinecraft(
  options: MinecraftOptions = {},
): Promise<MinecraftTemplate> {
  return (await napi.resolveMinecraft(options)) as MinecraftTemplate;
}

/** Look a version up in the version manifest and fetch its version JSON. */
export async function fetchClient(
  versionId?: string,
  options: Omit<MinecraftOptions, 'version'> = {},
): Promise<FetchedClient> {
  return (await napi.fetchClient({
    ...options,
    version: versionId,
  })) as FetchedClient;
}

/**
 * Map an already-resolved version JSON. Only the asset manifest is fetched —
 * the loaders arrive here holding a `Client` they resolved their own way.
 */
export async function clientToTemplate(
  client: Client,
): Promise<MinecraftTemplate> {
  return (await napi.clientToTemplate(client)) as MinecraftTemplate;
}

/** Fetch `version_manifest_v2.json`, or another URL serving that document. */
export async function fetchVersionManifest(
  url?: string,
): Promise<VersionManifest> {
  return (await napi.fetchVersionManifest(url)) as VersionManifest;
}

/** Fetch and parse an asset manifest. */
export async function fetchAssetManifest(url: string): Promise<AssetManifest> {
  return (await napi.fetchAssetManifest(url)) as AssetManifest;
}

// ──────────────────────────────────────────────────────────────────────────
// Mappers — pure; shared with every loader in the family.
// ──────────────────────────────────────────────────────────────────────────

/** The pure half of {@link clientToTemplate}, for a caller holding both. */
export function mapClientToTemplate(
  client: Client,
  assets: AssetManifest,
): MinecraftTemplate {
  return napi.mapClientToTemplate(client, assets) as MinecraftTemplate;
}

export function mapClientJar(client: Client): Artifact {
  return napi.mapClientJar(client) as Artifact;
}

export function libraryToArtifact(library: Library): Artifact {
  return napi.libraryToArtifact(library) as Artifact;
}

export function mapLibraries(libraries: readonly Library[]): Artifact[] {
  return napi.mapLibraries(libraries) as Artifact[];
}

export function mapAssetIndex(index: AssetIndex): Artifact {
  return napi.mapAssetIndex(index) as Artifact;
}

export function mapAssetObjects(manifest: AssetManifest): Artifact[] {
  return napi.mapAssetObjects(manifest) as Artifact[];
}

/** The `${classpath}` arms — one per OS, each led by the client jar. */
export function buildClasspath(
  libs: readonly ClasspathEntry[],
  clientJarPath: string,
): ConditionalVal[] {
  return napi.buildClasspath(libs, clientJarPath) as ConditionalVal[];
}

/** `{ launch, jvmArgs, mainClass, gameArgs }` from a main class and its args. */
export function buildLaunch(
  mainClass: string,
  gameArgs: readonly MojangArgValue[],
  jvmArgs: readonly MojangArgValue[],
): LaunchParts {
  return napi.buildLaunch(mainClass, gameArgs, jvmArgs) as LaunchParts;
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

/** Vanilla Minecraft client + libraries + assets. */
export function minecraft(
  version?: string,
  options: Omit<MinecraftOptions, 'version'> = {},
): ChainablePlugin {
  return definePlugin({
    name: 'minecraft',
    async build(ctx) {
      const t = await resolveMinecraft({ ...options, version });
      ctx.log('minecraft', `vanilla ${version ?? 'latest'}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}
