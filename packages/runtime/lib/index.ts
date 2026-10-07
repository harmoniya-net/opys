/**
 * `@opys/runtime` — install + launch executor. Behaviors are backed by the
 * Rust `opys-runtime` crate (via napi-rs); the TS surface wraps the
 * binding with a Node `child_process.spawn` for `launch`, and translates
 * the napi-thrown messages back into the typed `NetworkError` /
 * `IntegrityError` / `ExtractionError` classes consumers still
 * `instanceof`-check.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { Blobs, Manifest } from '@opys/core';
import * as napi from '@opys/runtime-binding';

/**
 * Where the manifest to install comes from. Discriminated by which field is
 * present, like every shape in the format:
 *
 *  - `{ bundle }` — a bundle on disk;
 *  - `{ url }` — a bundle to download, whole, before anything is installed;
 *  - `{ manifest, blobs }` — a manifest in memory and where each blob it
 *    names is kept, which is what a build hands over when nothing was written
 *    out in between.
 */
export type ManifestSource =
  | { readonly bundle: string }
  | { readonly url: string }
  | { readonly manifest: Manifest; readonly blobs?: Blobs };

/**
 * Discriminated by `phase`. The Rust bridge populates only the fields
 * relevant to each phase; the union encodes that contract so consumers can
 * narrow on `phase` and access the populated fields without optional-chain
 * dances.
 */
export type InstallProgress =
  | { phase: 'resolve' }
  | { phase: 'download'; fetched: number; total: number; skipped: number }
  | { phase: 'download:start'; path: string; total: number }
  | { phase: 'download:bytes'; path: string; bytes: number }
  | { phase: 'download:done'; path: string }
  | { phase: 'verify' }
  | { phase: 'extract'; count: number }
  | { phase: 'sweep'; removed: number };

export interface InstallOptions {
  platform?: napi.OsOptions;
  vars?: Record<string, string>;
  concurrency?: number;
  verifyIntegrity?: boolean;
  features?: string[];
  onProgress?: (p: InstallProgress) => void;
}

export interface LaunchOptions {
  platform?: napi.OsOptions;
  features?: string[];
  vars?: Record<string, string>;
  cwd?: string;
  install?: InstallOptions | false;
}

/**
 * Compat error classes. The Rust bridge currently throws
 * `napi::Error::from_reason(msg)` with the discriminant baked into the
 * message ("HTTP …", "Integrity check failed: …", "Failed to extract …");
 * `translateError` re-wraps those into these classes so consumers using
 * `instanceof` keep working. Q10's `code`-discriminant model is the
 * follow-up — when the Rust side emits structured errors, these classes
 * either gain a `code` field or get replaced wholesale.
 */
export class NetworkError extends Error {
  readonly kind = 'network' as const;
  constructor(
    readonly url: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}
export class IntegrityError extends Error {
  readonly kind = 'integrity' as const;
  constructor(readonly paths: string[]) {
    super(`Integrity check failed: ${paths.join(', ')}`);
    this.name = 'IntegrityError';
  }
}
export class ExtractionError extends Error {
  readonly kind = 'extraction' as const;
  constructor(
    readonly artifactPath: string,
    options?: ErrorOptions,
  ) {
    super(`Failed to extract ${artifactPath}`, options);
    this.name = 'ExtractionError';
  }
}
export type InstallError = NetworkError | IntegrityError | ExtractionError;

export function translateError(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  const msg = err.message;
  let m = /^HTTP (\d+) downloading (\S+)/.exec(msg);
  if (m) return new NetworkError(m[2]!, Number(m[1]!), msg);
  m = /^Integrity check failed:\s*(.+)$/.exec(msg);
  if (m) {
    const paths = m[1]!
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return new IntegrityError(paths);
  }
  m = /^Failed to extract (\S+):/.exec(msg);
  if (m) return new ExtractionError(m[1]!, { cause: err });
  return err;
}

/** Adapt the caller's typed callback to the untyped one the binding takes. */
const bridge = (onProgress: InstallOptions['onProgress']) =>
  onProgress
    ? (event: unknown) => onProgress(event as InstallProgress)
    : undefined;

export async function install(
  source: ManifestSource,
  options: InstallOptions = {},
): Promise<void> {
  const { onProgress, ...rest } = options;
  try {
    await napi.install(source, rest, bridge(onProgress));
  } catch (err) {
    throw translateError(err);
  }
}

/**
 * What to spawn, without installing or spawning. Everything it needs is in
 * the manifest's head, so for a bundle on disk the artifact list is not read.
 */
export async function buildLaunch(
  source: ManifestSource,
  options: Omit<LaunchOptions, 'install'> = {},
): Promise<napi.LaunchSpec> {
  try {
    return await napi.buildLaunch(source, options);
  } catch (err) {
    throw translateError(err);
  }
}

/**
 * Install, then say what to spawn — from one reading of the source, so a
 * bundle is opened, or downloaded, once for both. With `install: false` this
 * is `buildLaunch`.
 */
export async function prepare(
  source: ManifestSource,
  options: LaunchOptions = {},
): Promise<napi.LaunchSpec> {
  const { install: installOpts = {}, ...launchRest } = options;
  if (installOpts === false) return buildLaunch(source, launchRest);
  const { onProgress, ...installRest } = installOpts;
  try {
    // An `AsyncTask` is typed `Promise<unknown>` by the generated `.d.ts`.
    return (await napi.prepare(
      source,
      launchRest,
      installRest,
      bridge(onProgress),
    )) as napi.LaunchSpec;
  } catch (err) {
    throw translateError(err);
  }
}

/** Spawn what a {@link LaunchSpec} describes, inheriting this process's stdio. */
export function spawnLaunch(spec: napi.LaunchSpec): ChildProcess {
  return spawn(spec.command, spec.args, {
    cwd: spec.workdir,
    env: { ...process.env, ...spec.envs },
    stdio: 'inherit',
  });
}

export async function launch(
  source: ManifestSource,
  options: LaunchOptions = {},
): Promise<ChildProcess> {
  return spawnLaunch(await prepare(source, options));
}

export const currentPlatform = napi.currentPlatform;
export type OsOptions = napi.OsOptions;
export type LaunchSpec = napi.LaunchSpec;
