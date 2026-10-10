/**
 * `@opys/runtime` — install + launch executor. Behaviors are backed by the
 * Rust `opys-runtime` crate (via napi-rs); the TS surface wraps the
 * binding with a Node `child_process.spawn` for `launch`, and translates
 * the napi-thrown messages back into the typed `NetworkError` /
 * `IntegrityError` / `ExtractionError` classes consumers still
 * `instanceof`-check.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { Head } from '@opys/bundle';
import type { Manifest } from '@opys/core';
import { runtime as napi } from '@opys/binding';

/**
 * Where the manifest to install comes from. Discriminated by which field is
 * present, like every shape in the format:
 *
 *  - `{ bundle }` — a bundle on disk;
 *  - `{ url }` — a bundle to download, whole, before anything is installed;
 *  - `{ manifest }` — a manifest in memory. It can name no blob: a blob is
 *    an entry of a bundle.
 */
export type ManifestSource =
  | { readonly bundle: string }
  | { readonly url: string }
  | { readonly manifest: Manifest };

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
  /** `removed` counts files; `directories`, the ones they left empty. */
  | { phase: 'cleanup'; removed: number; directories: number };

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

type NativeProgress = (event: unknown) => void;

/**
 * Run a native call that reports progress, and settle only once every event
 * it sent has been handed to `onProgress`.
 *
 * The binding's promise and its progress callback reach JS by two queues
 * that nothing orders, so the promise could settle with the last events
 * still on their way. The binding therefore ends the callback's queue with
 * a marker, `{ phase: 'end' }`, which is waited for here and never passed
 * on. A call the binding refuses before it starts throws at once and sends
 * no marker, so nothing waits for one.
 */
async function withProgress<T>(
  onProgress: InstallOptions['onProgress'],
  run: (progress: NativeProgress | undefined) => Promise<T>,
): Promise<T> {
  if (!onProgress) return run(undefined);
  let end!: () => void;
  const drained = new Promise<void>((resolve) => (end = resolve));
  const task = run((event) => {
    if ((event as { phase: string }).phase === 'end') end();
    else onProgress(event as InstallProgress);
  });
  try {
    return await task;
  } finally {
    await drained;
  }
}

export async function install(
  source: ManifestSource,
  options: InstallOptions = {},
): Promise<void> {
  const { onProgress, ...rest } = options;
  try {
    await withProgress(onProgress, (progress) =>
      napi.install(source, rest, progress),
    );
  } catch (err) {
    throw translateError(err);
  }
}

/**
 * What a bundle says about itself, read before anything is installed: its
 * `options` are what a launcher draws its settings from. The manifest is
 * left unread, and a bundle behind a URL is not downloaded: only the front
 * of the file is asked for.
 *
 * `undefined` for a `{ manifest }` source, which is in no bundle.
 */
export async function readHead(
  source: ManifestSource,
): Promise<Head | undefined> {
  try {
    return ((await napi.readHead(source)) as Head | null) ?? undefined;
  } catch (err) {
    throw translateError(err);
  }
}

/** What to spawn, without installing or spawning. */
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
    return (await withProgress(onProgress, (progress) =>
      napi.prepare(source, launchRest, installRest, progress),
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
export type { Head } from '@opys/bundle';
