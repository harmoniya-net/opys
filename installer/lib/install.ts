import {
  type Unifact,
  type Unifest,
  ExtractDump,
  interpolate,
  resolveVars,
} from '@unifest/core';
import type { SatisfiesOsOptions } from '@unifest/rules';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ExtractionError, IntegrityError, NetworkError } from './errors';
import { readBytes, verifyIntegrity } from './fs';
import { currentPlatform } from './platform';
import { withRetry } from './retry';
import { extractZip } from './zip';
import {
  DEFAULT_CONCURRENCY,
  DOWNLOAD_RETRIES,
  FETCH_TIMEOUT_MS,
  MAX_ATTEMPTS,
  PROGRESS_THROTTLE_MS,
  RETRY_BASE_MS,
} from './constants';

/** A manifest source: an already-parsed {@link Unifest}, a file path, or a URL. */
export type ManifestSource = Unifest | string | URL;

/** Resolve a {@link ManifestSource} to a {@link Unifest}. */
export async function resolveManifest(
  source: ManifestSource,
): Promise<Unifest> {
  if (typeof source === 'object' && 'unifacts' in source)
    return source as Unifest;
  const { Unifest } = await import('@unifest/core');
  if (
    source instanceof URL ||
    (typeof source === 'string' && /^https?:\/\//.test(source))
  ) {
    const res = await fetch(source instanceof URL ? source.href : source);
    if (!res.ok) await toNetworkError(res);
    return Unifest.parse(await res.text());
  }
  return Unifest.parse(await readFile(source as string, 'utf8'));
}

/**
 * Progress snapshot passed to {@link InstallOptions.onProgress} on every event.
 * The `phase` discriminant determines which fields are present.
 */
export type InstallProgress =
  | { phase: 'resolve' }
  | {
      phase: 'download';
      fetched: number;
      total: number;
      skipped: number;
      /** All files currently being downloaded. Empty on initial emit and when all files complete. */
      activeFiles: ReadonlyArray<{
        name: string;
        /** Bytes received so far for this file. */
        bytes: number;
        /** Expected file size in bytes (0 if unknown). */
        total: number;
      }>;
    }
  | { phase: 'verify' }
  | { phase: 'extract'; count: number };

export interface InstallOptions {
  /** Override the detected platform. */
  platform?: SatisfiesOsOptions;
  /** Extra variables that override manifest vars. */
  vars?: Record<string, string>;
  /** Max parallel HTTP connections. Defaults to 8. */
  concurrency?: number;
  /**
   * Called on every install event: phase transitions and per-file download completions.
   * During `download`, called once with `fetched: 0` and empty `activeFiles` when the
   * total is known, then on every file start/completion and throttled (≤once/s) for
   * byte-level updates.
   */
  onProgress?: (progress: InstallProgress) => void;
  /**
   * Whether to verify file integrity.
   * - After all files are installed: all applicable files are verified in a
   *   single batch pass. On failure the bad files are deleted and the whole
   *   cycle restarts once. If files still fail after the retry the install
   *   throws an {@link IntegrityError} with the list of failing paths.
   * Defaults to `true`. Pass `false` to skip all hash checking.
   */
  verifyIntegrity?: boolean;
  /**
   * Internal event log for retries, integrity failures, and per-file debug info.
   * Wire to a logger at the appropriate level; never called for normal progress.
   */
  log?: (level: 'debug' | 'warn', message: string) => void;
}

async function toNetworkError(res: Response): Promise<never> {
  const isText = res.headers.get('content-type')?.includes('text') ?? false;
  const body = isText ? (await res.text()).slice(0, 200) : '';
  throw new NetworkError(res.url, res.status, body);
}

/**
 * Returns how many semaphore slots a download of `bytes` should consume.
 * Uses log-base-8 tiers so large files are naturally rate-limited while tiny
 * files (e.g. Minecraft assets) run at full concurrency.
 *
 * Real Minecraft 1.20.1 distribution (3,681 files):
 *   93.6% < 512 KB  → 1 slot  (sound/texture assets, full concurrency)
 *    ~5%  < 2 MB    → 2 slots (lang files, small ogg)
 *    ~1%  < 8 MB    → 4 slots (larger music tracks)
 *    ~0%  ≥ 8 MB    → all slots (client.jar, fastutil, large music — serial)
 *
 * Tier boundary: each 4× size increase doubles the slot weight.
 * Base unit: 512 KB. At exactly 512 KB → tier 1 (2 slots).
 * With default c=8: files ≥ 8 MB serialize, preventing CDN tail timeouts.
 */
export function slotWeight(
  bytes: number | null | undefined,
  totalSlots: number,
): number {
  if (!bytes || totalSlots <= 1) return 1;
  const BASE = 512 * 1024; // 512 KB
  if (bytes < BASE) return 1;
  // tier 1 at 512 KB, +1 per 4× size increase (2 MB → tier 2, 8 MB → tier 3, …)
  const tier = 1 + Math.floor(Math.log(bytes / BASE) / Math.log(4));
  return Math.min(Math.pow(2, tier), totalSlots);
}

/**
 * Weighted semaphore: each acquisition consumes `n` slots.
 * Large downloads consume more slots, naturally limiting their concurrency.
 */
class Semaphore {
  private slots: number;
  private readonly queue: Array<{ n: number; resolve: () => void }> = [];

  constructor(readonly limit: number) {
    this.slots = limit;
  }

  acquire(n = 1): Promise<void> {
    if (this.slots >= n) {
      this.slots -= n;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push({ n, resolve }));
  }

  release(n = 1): void {
    this.slots += n;
    // Wake up the next waiter whose weight fits in the available slots.
    // FIFO within the same weight keeps ordering predictable.
    const i = this.queue.findIndex((w) => w.n <= this.slots);
    if (i !== -1) {
      const { n: acquired, resolve } = this.queue.splice(i, 1)[0]!;
      this.slots -= acquired;
      resolve();
    }
  }

  async use<T>(fn: () => Promise<T>, n = 1): Promise<T> {
    await this.acquire(n);
    try {
      return await fn();
    } finally {
      this.release(n);
    }
  }
}

async function fetchToTmp(
  unifact: Unifact,
  tmpPath: string,
  vars: Record<string, string>,
  sem: Semaphore,
  onStart?: () => void,
  onBytes?: (received: number) => void,
): Promise<void> {
  const src = unifact.source;
  if (src.isUrl()) {
    const url = interpolate(src.url()!, vars);
    const weight = slotWeight(unifact.size.bytes(), sem.limit);
    await sem.use(async () => {
      // Semaphore acquired — slot is held, download is actually starting now.
      onStart?.();
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) await toNetworkError(res);
      const ws = createWriteStream(tmpPath);
      if (onBytes) {
        let received = 0;
        const tracker = new Transform({
          transform(chunk: Buffer, _enc, cb) {
            received += chunk.length;
            onBytes(received);
            cb(null, chunk);
          },
        });
        await pipeline(Readable.fromWeb(res.body!), tracker, ws);
      } else {
        await pipeline(Readable.fromWeb(res.body!), ws);
      }
    }, weight);
  } else if (src.isFile()) {
    onStart?.();
    await writeFile(tmpPath, await readFile(interpolate(src.file()!, vars)));
  } else if (src.isString()) {
    onStart?.();
    await writeFile(tmpPath, src.string()!);
  } else {
    throw new Error(
      `Unsupported source type for artifact: ${interpolate(unifact.path, vars)}`,
    );
  }
}

interface DownloadTask {
  unifact: Unifact;
  finalPath: string;
  tmpPath: string;
}

// — Phase functions —

function queueMissingTasks(
  unifacts: Unifact[],
  finalPaths: string[],
  stagingDir: string,
): DownloadTask[] {
  return unifacts.flatMap((unifact, i) => {
    const finalPath = finalPaths[i]!;
    if (existsSync(finalPath) || unifact.source.isEmpty()) return [];
    return [{ unifact, finalPath, tmpPath: join(stagingDir, String(i)) }];
  });
}

async function downloadAndMove(
  tasks: DownloadTask[],
  vars: Record<string, string>,
  concurrency: number,
  log: ((level: 'debug' | 'warn', msg: string) => void) | undefined,
  onUpdate?: (
    fetched: number,
    total: number,
    activeFiles: ReadonlyArray<{ name: string; bytes: number; total: number }>,
  ) => void,
): Promise<void> {
  // Small files first: they finish quickly and free semaphore slots for large files.
  // Large files consume more slots (via slotWeight) so fewer run simultaneously.
  // Unknown size treated as 0 (most Minecraft assets are tiny).
  tasks.sort(
    (a, b) => (a.unifact.size.bytes() ?? 0) - (b.unifact.size.bytes() ?? 0),
  );

  // One semaphore caps total simultaneous HTTP connections across all tasks and chunks.
  const sem = new Semaphore(concurrency);
  let fetched = 0;

  // Track files that are actively downloading (semaphore slot held).
  // Populated only after sem.acquire() so the count never exceeds `concurrency`.
  const activeFiles = new Map<string, { bytes: number; total: number }>();
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;

  function snapshot(): ReadonlyArray<{
    name: string;
    bytes: number;
    total: number;
  }> {
    return Array.from(activeFiles, ([name, v]) => ({ name, ...v }));
  }
  function emitNow(): void {
    throttleTimer = null;
    onUpdate?.(fetched, tasks.length, snapshot());
  }
  // All state changes go through a single 1-second trailing throttle.
  // A final flush after Promise.all always emits the terminal state.
  function emit(): void {
    if (throttleTimer === null)
      throttleTimer = setTimeout(emitNow, PROGRESS_THROTTLE_MS);
  }

  await Promise.all(
    tasks.map(async (task) => {
      const fileTotal = task.unifact.size.bytes() ?? 0;
      const sizeLabel =
        fileTotal > 0 ? ` (${(fileTotal / 1024).toFixed(0)} KB)` : '';
      log?.('debug', `Fetching ${task.finalPath}${sizeLabel}`);

      await withRetry(
        () =>
          fetchToTmp(
            task.unifact,
            task.tmpPath,
            vars,
            sem,
            // onStart: called after semaphore acquired — file is actually downloading now
            () => {
              activeFiles.set(task.finalPath, { bytes: 0, total: fileTotal });
              emit();
            },
            onUpdate
              ? (received) => {
                  activeFiles.set(task.finalPath, {
                    bytes: received,
                    total: fileTotal,
                  });
                  emit();
                }
              : undefined,
          ),
        DOWNLOAD_RETRIES,
        (attempt) =>
          Math.min(RETRY_BASE_MS * 2 ** attempt, 10_000) + Math.random() * 500,
        (attempt, err) => {
          const reason = err instanceof Error ? err.message : String(err);
          log?.(
            'warn',
            `Retry ${attempt}/${DOWNLOAD_RETRIES}: ${task.finalPath} — ${reason}`,
          );
        },
      );
      await mkdir(dirname(task.finalPath), { recursive: true });
      try {
        await rename(task.tmpPath, task.finalPath);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
        // Cross-device move: copy then delete source
        await writeFile(task.finalPath, await readBytes(task.tmpPath));
        await rm(task.tmpPath, { force: true });
      }

      activeFiles.delete(task.finalPath);
      fetched++;
      emit();
    }),
  );

  // Final flush: always emit terminal state (all done, activeFiles empty) regardless
  // of where the throttle timer stands.
  if (throttleTimer !== null) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  onUpdate?.(fetched, tasks.length, []);
}

async function verifyBatch(
  unifacts: Unifact[],
  finalPaths: string[],
  log: ((level: 'debug' | 'warn', msg: string) => void) | undefined,
): Promise<string[]> {
  const results = await Promise.all(
    unifacts.map(async (unifact, i) => {
      if (unifact.integrity.isSkip()) return null;
      const ok = await verifyIntegrity(finalPaths[i]!, unifact.integrity);
      if (!ok) log?.('warn', `Integrity failed: ${finalPaths[i]}`);
      return ok ? null : finalPaths[i]!;
    }),
  );
  return results.filter((p): p is string => p !== null);
}

async function extractAll(
  extractTasks: Array<{ finalPath: string; unifact: Unifact }>,
  vars: Record<string, string>,
): Promise<void> {
  const cleanedDirs = new Set<string>();
  for (const { finalPath, unifact } of extractTasks) {
    for (const rule of unifact.extract!) {
      if (rule instanceof ExtractDump) {
        const targetDir = interpolate(rule.into, vars);
        if (rule.clean && !cleanedDirs.has(targetDir)) {
          await rm(targetDir, { recursive: true, force: true });
          cleanedDirs.add(targetDir);
        }
        await mkdir(targetDir, { recursive: true });
        const excludes = rule.excludes ?? ['META-INF/'];
        try {
          await extractZip(finalPath, targetDir, rule.includes, excludes);
        } catch (e) {
          throw new ExtractionError(finalPath, { cause: e });
        }
      }
    }
  }
}

/**
 * Install all artifacts from a Unifest manifest.
 *
 * Downloads missing artifacts in parallel to a staging directory, then
 * atomically moves them to their final paths. After all files are in place a
 * single batch integrity pass runs over every applicable file. Any files that
 * fail are deleted and the whole download→move→verify cycle restarts once. If
 * files still fail after the retry the install throws an {@link IntegrityError}
 * with the list of failing paths. Artifacts with an `extract` rule (e.g.
 * native libraries) are unpacked only after integrity is confirmed.
 *
 * Already-installed artifacts (file exists on disk) are skipped in Phase 1.
 *
 * @example
 * ```ts
 * import { install } from '@unifest/installer';
 *
 * await install('unifest.json', { vars: { root: '/opt/minecraft/1.20.1' } });
 * await install(new URL('https://example.com/pack.json'), { concurrency: 64 });
 * ```
 */
export async function install(
  source: ManifestSource,
  options: InstallOptions = {},
): Promise<void> {
  const {
    vars: extraVars = {},
    concurrency = DEFAULT_CONCURRENCY,
    onProgress,
    log,
  } = options;
  const shouldVerify = options.verifyIntegrity !== false;
  const platform = options.platform ?? currentPlatform();

  onProgress?.({ phase: 'resolve' });
  const manifest = await resolveManifest(source);

  const flatVars = { ...manifest.vars.resolve(platform), ...extraVars };
  const vars = resolveVars(flatVars);
  const applicable = manifest.filter(platform);
  const finalPaths = applicable.unifacts.map((u) => interpolate(u.path, vars));
  const extractTasks = applicable.unifacts
    .map((u, i) =>
      u.extract ? { finalPath: finalPaths[i]!, unifact: u } : null,
    )
    .filter((t): t is { finalPath: string; unifact: Unifact } => t !== null);

  const skipped = applicable.unifacts.filter(
    (u, i) => existsSync(finalPaths[i]!) || u.source.isEmpty(),
  ).length;

  // NOTE: two concurrent install() calls in the same process share this staging dir (same pid).
  const stagingDir = join(tmpdir(), `unifest-${process.pid}`);
  await mkdir(stagingDir, { recursive: true });

  try {
    // Accumulate final paths of artifacts freshly downloaded in this run (across all attempts).
    // Only these need extraction — already-cached artifacts were already extracted on a prior run.
    const freshPaths = new Set<string>();

    for (let attempt = 1; ; attempt++) {
      const tasks = queueMissingTasks(
        applicable.unifacts,
        finalPaths,
        stagingDir,
      );
      if (attempt === 1) {
        onProgress?.({
          phase: 'download',
          fetched: 0,
          total: tasks.length,
          skipped,
          activeFiles: [],
        });
      }
      if (tasks.length > 0) {
        for (const t of tasks) freshPaths.add(t.finalPath);
        await downloadAndMove(
          tasks,
          vars,
          concurrency,
          log,
          (fetched, total, activeFiles) => {
            onProgress?.({
              phase: 'download',
              fetched,
              total,
              skipped,
              activeFiles,
            });
          },
        );
      }

      if (shouldVerify) {
        onProgress?.({ phase: 'verify' });
        const failures = await verifyBatch(
          applicable.unifacts,
          finalPaths,
          log,
        );
        if (failures.length === 0) break;
        if (attempt >= MAX_ATTEMPTS) throw new IntegrityError(failures);
        log?.(
          'warn',
          `${failures.length} file(s) failed integrity — restarting cycle (attempt ${attempt + 1}/${MAX_ATTEMPTS})`,
        );
        // Delete bad files and restart so they get re-downloaded.
        await Promise.all(failures.map((p) => rm(p, { force: true })));
      } else {
        break;
      }
    }

    // Only extract artifacts that were freshly downloaded in this run.
    // Already-cached artifacts skip extraction, preventing redundant dir wipes on re-launch.
    const freshExtractTasks = extractTasks.filter((t) =>
      freshPaths.has(t.finalPath),
    );
    if (freshExtractTasks.length > 0) {
      onProgress?.({ phase: 'extract', count: freshExtractTasks.length });
      await extractAll(freshExtractTasks, vars);
    }
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}
