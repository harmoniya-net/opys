import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import type { Artifact } from '@torba/core';
import {
  isSourceUrl,
  isSourceFile,
  isSourceString,
  isSourceBytes,
  interpolate,
} from '@torba/core';

export interface FetchTask {
  artifact: Artifact;
  finalPath: string;
}

export interface FetchHooks {
  onStart?: (task: FetchTask) => void;
  onBytes?: (task: FetchTask, bytes: number) => void;
  onDone?: (task: FetchTask) => void;
}

const RETRY_DELAYS_MS = [500, 2_000, 8_000];

function counter(onBytes: (n: number) => void): Transform {
  let total = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      total += chunk.length;
      onBytes(total);
      cb(null, chunk);
    },
  });
}

async function fetchOnce(
  task: FetchTask,
  vars: Record<string, string>,
  onBytes: (n: number) => void,
): Promise<void> {
  const { artifact, finalPath } = task;
  const src = artifact.source;
  await mkdir(dirname(finalPath), { recursive: true });
  const tmpPath = `${finalPath}.partial`;

  if (isSourceUrl(src)) {
    const url = interpolate(src.url, vars);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    if (res.body) {
      await pipeline(
        Readable.fromWeb(res.body as unknown as NodeReadableStream),
        counter(onBytes),
        createWriteStream(tmpPath),
      );
    } else {
      await writeFile(tmpPath, '');
    }
  } else if (isSourceFile(src)) {
    await pipeline(
      createReadStream(interpolate(src.file, vars)),
      counter(onBytes),
      createWriteStream(tmpPath),
    );
  } else if (isSourceString(src)) {
    await writeFile(tmpPath, src.string);
    onBytes(Buffer.byteLength(src.string));
  } else if (isSourceBytes(src)) {
    const buf = Buffer.from(src.bytes, 'base64');
    await writeFile(tmpPath, buf);
    onBytes(buf.length);
  } else {
    throw new Error(`Unsupported source for ${artifact.path}`);
  }

  await rename(tmpPath, finalPath);
}

async function fetchOne(
  task: FetchTask,
  vars: Record<string, string>,
  onBytes: (n: number) => void,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fetchOnce(task, vars, onBytes);
      return;
    } catch (err) {
      await rm(`${task.finalPath}.partial`, { force: true });
      if (attempt >= RETRY_DELAYS_MS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

/**
 * Concurrency cost of a download by size, against a budget that defaults to 8.
 * The buckets give: many tiny files run 8-wide, medium files 4-wide, large
 * 2-wide, and one really big file gets the pipe to itself — so a single
 * fat jar isn't split eight ways. Unknown size is treated as small.
 */
function weight(size: number | undefined): number {
  if (size === undefined) return 1;
  const MB = 1024 * 1024;
  if (size < 1 * MB) return 1; // small
  if (size < 10 * MB) return 2; // medium
  if (size < 50 * MB) return 4; // large
  return 8; // huge — runs alone at the default budget
}

/**
 * Weighted semaphore: admits any waiter whose weight currently fits, in queue
 * order. Skipping a too-big head to admit a smaller follower avoids
 * head-of-line blocking when an LPT-sorted queue puts the heaviest task first.
 */
class Budget {
  private used = 0;
  private waiters: Array<{ need: number; resolve: () => void }> = [];
  constructor(private readonly cap: number) {}

  async acquire(amount: number): Promise<void> {
    const need = Math.min(amount, this.cap);
    if (this.used + need <= this.cap) {
      this.used += need;
      return;
    }
    return new Promise((resolve) => {
      this.waiters.push({ need, resolve });
    });
  }

  release(amount: number): void {
    const need = Math.min(amount, this.cap);
    this.used -= need;
    for (let i = 0; i < this.waiters.length; ) {
      const w = this.waiters[i]!;
      if (this.used + w.need <= this.cap) {
        this.waiters.splice(i, 1);
        this.used += w.need;
        w.resolve();
      } else {
        i++;
      }
    }
  }
}

export async function fetchAll(
  tasks: FetchTask[],
  vars: Record<string, string>,
  concurrency: number,
  hooks: FetchHooks = {},
): Promise<void> {
  // Largest-first so the heavy files claim budget early and smaller files
  // backfill as bytes free up. Unknown size sinks to the end.
  const ordered = [...tasks].sort(
    (a, b) => (b.artifact.size ?? 0) - (a.artifact.size ?? 0),
  );

  const budget = new Budget(concurrency);
  await Promise.all(
    ordered.map(async (task) => {
      const w = weight(task.artifact.size);
      await budget.acquire(w);
      try {
        hooks.onStart?.(task);
        await fetchOne(task, vars, (n) => hooks.onBytes?.(task, n));
        hooks.onDone?.(task);
      } finally {
        budget.release(w);
      }
    }),
  );
}
