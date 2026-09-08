/**
 * `@opys/java` — JDK provisioning.
 *
 * Behaviour lives in the `opys-java` crate and reaches JS through
 * `@opys/java-binding`; this module is the typed surface over it. The
 * codegen'd binding types everything as `Json` (≈ `unknown`), so each wrapper
 * carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * What stays here is the half that cannot cross: `java()` is a closure the
 * build engine calls with a `BuildContext`, so the plugin wrapper — and its
 * `ctx.log` — is JS. Everything it wraps is one native call.
 */

import * as napi from '@opys/java-binding';
import {
  definePlugin,
  type ChainablePlugin,
  type Contribution,
} from '@opys/dev';
import type { Artifact, Discovery, OsName, ValDefs } from '@opys/core';

// ──────────────────────────────────────────────────────────────────────────
// Platforms
// ──────────────────────────────────────────────────────────────────────────

/** Archs every vendor resolver in this package targets. */
export type SupportedArch = 'x86_64' | 'aarch64';

/** An (OS, arch) pair a vendor resolver fetches a binary for. */
export interface Platform {
  readonly os: OsName;
  readonly arch: SupportedArch;
}

/** linux/osx/windows × x86_64+aarch64 — read from the crate, not restated. */
export const DEFAULT_PLATFORMS: readonly Platform[] =
  napi.defaultPlatforms() as Platform[];

// ──────────────────────────────────────────────────────────────────────────
// Resolved release — mirrors the `opys-java` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/**
 * One resolved, downloadable JDK binary for a single platform. Every vendor
 * resolver produces this shape, so the template turns it into an `Artifact`
 * without vendor-specific branching.
 */
export interface VendorBinary {
  readonly platform: Platform;
  readonly filename: string;
  readonly url: string;
  readonly size: number;
  /** Absent when the vendor can't provide a checksum at resolve time — falls back to `discovery`. */
  readonly sha256?: string;
  /** Install-time checksum discovery, used when `sha256` is absent. */
  readonly discovery?: Discovery;
}

/** A resolved JDK release — vendor-agnostic input to the shared template. */
export interface VendorRelease {
  /** Human-readable label for `ctx.log`, e.g. `Temurin 21.0.13+11`. */
  readonly label: string;
  /** Major version — buckets the runtime dir as `jdk-<major>`. */
  readonly major: number;
  readonly binaries: readonly VendorBinary[];
}

// ──────────────────────────────────────────────────────────────────────────
// Options
// ──────────────────────────────────────────────────────────────────────────

export type JavaVendor = 'temurin' | 'zulu' | 'graalvm';

export interface JavaOptions {
  /**
   * JDK version. Accepts:
   *   - Major:        `'21'` — resolves to the latest GA for that major.
   *   - Full version: vendor-specific exact build (see each resolver).
   */
  version: string;
  /** Distribution to fetch from. Defaults to `'temurin'` (Eclipse Adoptium). */
  vendor?: JavaVendor;
  /** Override the platform set. Default covers linux/osx/windows × x86_64+aarch64. */
  platforms?: readonly Platform[];
  /** API base URL override — an Adoptium/Azul mirror, or a GitHub Enterprise host. */
  apiBase?: string;
  /** GitHub token for higher rate limits — `graalvm` only. */
  token?: string;
}

/** Shared by the per-vendor resolvers that read an API base. */
export interface ResolveTemurinOptions {
  /** Override the platform set. Default: linux/mac/windows × x64+aarch64. */
  platforms?: readonly Platform[];
  /** Optional override for the Adoptium API base URL. */
  apiBase?: string;
}

export interface ResolveZuluOptions {
  /** Override the platform set. Default: linux/mac/windows × x64+aarch64. */
  platforms?: readonly Platform[];
  /** Optional override for the Azul Metadata API base URL. */
  apiBase?: string;
}

export interface ResolveGraalvmOptions {
  /** Override the platform set. Default: linux/mac/windows × x64+aarch64. */
  platforms?: readonly Platform[];
  /** Optional GitHub token for higher rate limits. */
  token?: string;
  /** Optional override for the GitHub API base URL. */
  apiBase?: string;
}

export interface JavaTemplate {
  /** Per-platform JDK archives, scoped by OS+arch rules and extracted on first install. */
  artifacts: Artifact[];
  /** `java_home` and `java_bin` per OS — spread into your loader's vars. */
  vars: ValDefs;
  /** Resolved release metadata. */
  release: VendorRelease;
}

// ──────────────────────────────────────────────────────────────────────────
// Resolvers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Build a manifest fragment that auto-installs a JDK runtime and exposes
 * `${java_home}` + `${java_bin}` vars.
 *
 * Each platform's archive is emitted as its own `Artifact` with an OS+arch
 * rule, so only the matching binary downloads at install time. Archives
 * extract into `${java_runtime_dir}/jdk-<major>/` with the archive's own
 * top-level directory glob-stripped regardless of what it's named. On macOS,
 * `${java_home}` includes the `/Contents/Home` suffix Mac JDK bundles use; on
 * Windows, `${java_bin}` defaults to `javaw.exe` (no console window) and
 * switches to `java.exe` behind the `java_console` feature.
 *
 * ```ts
 * const jav = await resolveJava({ version: '21' });
 * return {
 *   artifacts: [lw.artifacts, jav.artifacts],
 *   vars: { ...lw.vars, ...jav.vars },
 *   command: lw.command, // command.command is `${java_bin}` already
 * };
 * ```
 */
export async function resolveJava(options: JavaOptions): Promise<JavaTemplate> {
  return (await napi.resolveJava(options)) as JavaTemplate;
}

/** Resolve an Eclipse Temurin (Adoptium) release across the given platforms. */
export async function resolveTemurin(
  version: string,
  options: ResolveTemurinOptions = {},
): Promise<VendorRelease> {
  return (await napi.resolveTemurin(version, options)) as VendorRelease;
}

/** Resolve an Azul Zulu release across the given platforms. */
export async function resolveZulu(
  version: string,
  options: ResolveZuluOptions = {},
): Promise<VendorRelease> {
  return (await napi.resolveZulu(version, options)) as VendorRelease;
}

/** Resolve a GraalVM CE release across the given platforms. */
export async function resolveGraalvm(
  version: string,
  options: ResolveGraalvmOptions = {},
): Promise<VendorRelease> {
  return (await napi.resolveGraalvm(version, options)) as VendorRelease;
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

/** What `buildJava` hands back — see `opys-java`'s `JavaBuild`. */
interface JavaBuild {
  output: { name: string; contribution: Contribution };
  release: VendorRelease;
}

/**
 * Provision a JDK runtime. Solely owns the `java_home` / `java_bin` /
 * `java_runtime_dir` vars and exposes `bin` as a launch group, so a config
 * wires the launch command with `command: ({ java }) => java.bin`. Defaults
 * to Temurin (Eclipse Adoptium); pass `vendor: 'zulu'` or `vendor: 'graalvm'`
 * for an alternate distribution.
 */
export function java(
  version: string,
  opts: Omit<JavaOptions, 'version'> = {},
): ChainablePlugin {
  return definePlugin({
    name: 'java',
    async build(ctx) {
      const build = (await napi.buildJava({ version, ...opts })) as JavaBuild;
      // e.g. `Temurin 21.0.13+11` / `Zulu 21.52.15 (JDK 21.0.12)` / `GraalVM CE 21.0.2`.
      ctx.log('java', build.release.label);
      return build.output.contribution;
    },
  });
}
