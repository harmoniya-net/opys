/**
 * `@opys/mojang` — parsers for the Mojang protocol: version manifest, client
 * JSON, libraries, assets, Maven coordinates.
 *
 * Behaviour lives in the `opys-mojang` crate and reaches JS through
 * `@opys/mojang-binding`; this module is the typed surface over it. The
 * codegen'd binding types everything as `Json` (≈ `unknown`), so each wrapper
 * carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * The package is self-contained: it also re-exports the Mojang rule surface,
 * because the addon links `opys-mojang-rules` in statically. Note the
 * contract — rules here are **strict** Mojang format. The opys shorthand
 * (`'allow.os.linux'`) is `@opys/core`'s own spelling and is rejected here.
 *
 * Fetching is deliberately absent: this package performs no I/O. Callers own
 * the HTTP (see `@opys/minecraft-vanilla`'s `fetchClient`).
 */

import * as napi from '@opys/mojang-binding';
import type {
  OsConstraint,
  OsOptions,
  FeatureConstraint,
  MojangRule,
  MojangRuleset,
} from '@opys/mojang-rules';

export type {
  OsName,
  OsArch,
  OsOptions,
  OsConstraint,
  FeatureConstraint,
  RuleAction,
  MojangRule,
  MojangRuleset,
} from '@opys/mojang-rules';
export { emptyRuleset, allowOsRuleset } from '@opys/mojang-rules';

// ──────────────────────────────────────────────────────────────────────────
// Domain types — mirror the `opys-mojang` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

export interface MavenCoord {
  readonly groupId: string;
  readonly artifactId: string;
  readonly version?: string;
  readonly classifier?: string;
  readonly packaging?: string;
}

export interface Artifact {
  readonly path: string;
  readonly sha1: string;
  readonly size: number;
  readonly url: string;
}

export interface Library {
  readonly name: MavenCoord;
  readonly rules: MojangRuleset;
  readonly artifact: Artifact;
  readonly native: boolean;
}

/** Raw Mojang argument: a plain string or a conditional `{ rules, value }`. */
export type MojangArgValue =
  string | { rules: MojangRuleset; value: string | string[] };

export interface Arguments {
  readonly game: MojangArgValue[];
  readonly jvm: MojangArgValue[];
  /** True if parsed from the legacy `minecraftArguments` string field. */
  readonly legacy: boolean;
}

export interface JavaVersion {
  readonly component: string;
  readonly majorVersion: number;
}

export interface AssetObject {
  readonly hash: string;
  readonly size: number;
}

export interface AssetManifest {
  readonly objects: Record<string, AssetObject>;
}

export interface AssetIndex {
  readonly id: string;
  readonly sha1: string;
  readonly size: number;
  readonly totalSize: number;
  readonly url: string;
}

export interface DownloadsFile {
  readonly sha1: string;
  readonly size: number;
  readonly url: string;
}

export interface Downloads {
  readonly client: DownloadsFile;
  readonly clientMappings?: DownloadsFile;
  readonly server?: DownloadsFile;
  readonly windowsServer?: DownloadsFile;
  readonly serverMappings?: DownloadsFile;
}

export interface LoggingFile {
  readonly id: string;
  readonly sha1: string;
  readonly size: number;
  readonly url: string;
}

export interface LoggingClient {
  readonly argument: string;
  readonly file: LoggingFile;
  readonly type: string;
}

export interface Logging {
  readonly client: LoggingClient;
}

export interface ClientMetadata {
  readonly type: string;
  readonly time: string;
  readonly releaseTime: string;
  readonly minimumLauncherVersion: number;
  readonly assets: string;
  readonly complianceLevel: number;
}

export interface Client {
  readonly id: string;
  readonly java: JavaVersion;
  readonly assetIndex: AssetIndex;
  readonly downloads: Downloads;
  readonly mainClass: string;
  readonly libraries: Library[];
  readonly args: Arguments;
  readonly metadata: ClientMetadata;
  readonly logging?: Logging;
}

export interface Version {
  readonly id: string;
  readonly type: string;
  readonly url: string;
  readonly time: string;
  readonly releaseTime: string;
  readonly sha1: string;
  readonly complianceLevel: number;
}

export interface VersionManifest {
  readonly latest: { release: string; snapshot: string };
  readonly versions: Version[];
}

/** JVM arguments implied by a legacy `minecraftArguments` version JSON. */
export const LEGACY_JVM_ARGS: MojangArgValue[] = [
  '-Djava.library.path=${natives_directory}',
  '-cp',
  '${classpath}',
];

export const VERSION_MANIFEST_URL = napi.versionManifestUrl();

// ──────────────────────────────────────────────────────────────────────────
// Protocol parsers
// ──────────────────────────────────────────────────────────────────────────

export function parseClient(raw: unknown): Client {
  return napi.parseClient(raw) as Client;
}

export function parseLibraries(raws: unknown[]): Library[] {
  return napi.parseLibraries(raws) as Library[];
}

export function parseArguments(raw: unknown): Arguments {
  return napi.parseArguments(raw) as Arguments;
}

/**
 * Merge a patch version's args onto a base version's (`inheritsFrom`).
 * A legacy patch carries no structured delta, so the base passes through.
 */
export function mergeArgs(base: Arguments, patch: Arguments): Arguments {
  return napi.mergeArgs(base, patch) as Arguments;
}

export function parseAssetManifest(raw: unknown): AssetManifest {
  return napi.parseAssetManifest(raw) as AssetManifest;
}

export function parseVersionManifest(raw: unknown): VersionManifest {
  return napi.parseVersionManifest(raw) as VersionManifest;
}

export function findVersion(
  manifest: VersionManifest,
  id: string,
): Version | undefined {
  return (napi.findVersion(manifest, id) as Version | null) ?? undefined;
}

/** The manifest's current release version. Throws when it is missing. */
export function latestRelease(manifest: VersionManifest): Version {
  return napi.latestRelease(manifest) as Version;
}

// ──────────────────────────────────────────────────────────────────────────
// Assets + Maven
// ──────────────────────────────────────────────────────────────────────────

/** URL for an asset object given its hash. */
export function assetUrl(hash: string): string {
  return napi.assetUrl(hash);
}

/** Relative path for an asset object within the objects directory. */
export function assetPath(hash: string): string {
  return napi.assetPath(hash);
}

export function parseMaven(value: string): MavenCoord {
  return napi.parseMaven(value) as MavenCoord;
}

export function encodeMaven(c: MavenCoord): string {
  return napi.encodeMaven(c);
}

export function isNativeMaven(c: MavenCoord): boolean {
  return napi.isNativeMaven(c);
}

/** Compare two coordinates on every field except {@link MavenCoord.version}. */
export function mavenMatchesIgnoringVersion(
  a: MavenCoord,
  b: MavenCoord,
): boolean {
  return napi.mavenMatchesIgnoringVersion(a, b);
}

// ──────────────────────────────────────────────────────────────────────────
// Mojang rules — strict format, no opys shorthand
// ──────────────────────────────────────────────────────────────────────────

/**
 * Decode a ruleset in strict Mojang form. A shorthand string such as
 * `'allow.os.linux'` throws here — that spelling belongs to `@opys/core`.
 */
export function decodeRuleset(raw: unknown): MojangRuleset {
  return napi.decodeRuleset(raw) as MojangRuleset;
}

export function encodeRuleset(ruleset: MojangRuleset): unknown {
  return napi.encodeRuleset(ruleset);
}

export function satisfiesRuleset(
  rules: MojangRuleset,
  platform: OsOptions,
  features: string[] = [],
): boolean {
  return napi.satisfiesRuleset(rules, platform, features);
}

export function satisfiesRule(
  rule: MojangRule,
  platform: OsOptions,
  features: string[] = [],
): boolean {
  return napi.satisfiesRule(rule, platform, features);
}

export function satisfiesOs(
  constraint: OsConstraint,
  platform: OsOptions,
): boolean {
  return napi.satisfiesOs(constraint, platform);
}

export function satisfiesFeatures(
  constraint: FeatureConstraint,
  features: string[] = [],
): boolean {
  return napi.satisfiesFeatures(constraint, features);
}
