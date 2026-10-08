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
  /**
   * Where the download stands. `bytes` counts finished files; `totalBytes` is
   * the sum of the sizes the manifest declares, so it is short by whatever is
   * listed without one.
   */
  | {
      phase: 'download';
      fetched: number;
      total: number;
      skipped: number;
      bytes: number;
      totalBytes: number;
    }
  /** `totalBytes` is 0 for a file the manifest gives no size. */
  | { phase: 'download:start'; path: string; totalBytes: number }
  | { phase: 'download:bytes'; path: string; bytes: number }
  | { phase: 'download:done'; path: string }
  | { phase: 'verify' }
  | { phase: 'extract'; count: number }
  /** `removed` counts files and the directories they left empty. */
  | { phase: 'cleanup'; removed: number };

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

/** What went wrong, as the runtime names it. */
export type RuntimeErrorCode =
  | 'network'
  | 'integrity'
  | 'extraction'
  | 'manifest'
  | 'io'
  | 'cancelled'
  | 'other';

/**
 * A failure of the runtime, told apart by `code`. The three with particulars
 * worth reading have classes of their own below; the rest are this one.
 */
export class RuntimeError extends Error {
  constructor(
    readonly code: RuntimeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RuntimeError';
  }
}
export class NetworkError extends RuntimeError {
  declare readonly code: 'network';
  constructor(
    readonly url: string,
    readonly status: number,
    message: string,
    /** What the server said, when it said anything. */
    readonly body = '',
  ) {
    super('network', message);
    this.name = 'NetworkError';
  }
}
export class IntegrityError extends RuntimeError {
  declare readonly code: 'integrity';
  constructor(
    readonly paths: string[],
    message = `Integrity check failed: ${paths.join(', ')}`,
  ) {
    super('integrity', message);
    this.name = 'IntegrityError';
  }
}
export class ExtractionError extends RuntimeError {
  declare readonly code: 'extraction';
  constructor(
    readonly artifactPath: string,
    message = `Failed to extract ${artifactPath}`,
    options?: ErrorOptions,
  ) {
    super('extraction', message, options);
    this.name = 'ExtractionError';
  }
}
export type InstallError = NetworkError | IntegrityError | ExtractionError;

/**
 * The report the binding throws, as the `opys-runtime` crate serialises it.
 * It is the message of the error that crosses napi and nothing else reads it.
 */
type ErrorReport =
  | {
      code: 'network';
      message: string;
      url: string;
      status: number;
      body: string;
    }
  | { code: 'integrity'; message: string; paths: string[] }
  | { code: 'extraction'; message: string; artifactPath: string; cause: string }
  | { code: 'manifest' | 'io' | 'cancelled' | 'other'; message: string };

function readReport(message: string): ErrorReport | undefined {
  if (!message.startsWith('{')) return undefined;
  try {
    const report = JSON.parse(message) as Partial<ErrorReport>;
    return typeof report.code === 'string' && typeof report.message === 'string'
      ? (report as ErrorReport)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The typed error behind what the binding threw. Anything that is not a
 * report — a bad argument refused before the runtime ran — comes back as it
 * was.
 */
export function translateError(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  const report = readReport(err.message);
  if (!report) return err;
  switch (report.code) {
    case 'network':
      return new NetworkError(
        report.url,
        report.status,
        report.message,
        report.body,
      );
    case 'integrity':
      return new IntegrityError(report.paths, report.message);
    case 'extraction':
      return new ExtractionError(report.artifactPath, report.message, {
        cause: new Error(report.cause),
      });
    default:
      return new RuntimeError(report.code, report.message);
  }
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
