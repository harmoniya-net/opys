import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import type { Artifact } from '@torba/core';
import {
  isSourceUrl,
  isSourceFile,
  isSourceString,
  interpolate,
} from '@torba/core';

export interface FetchTask {
  artifact: Artifact;
  finalPath: string;
}

const FETCH_TIMEOUT_MS = 30_000;

async function fetchOne(
  task: FetchTask,
  vars: Record<string, string>,
): Promise<void> {
  const { artifact, finalPath } = task;
  const src = artifact.source;
  await mkdir(dirname(finalPath), { recursive: true });
  const tmpPath = `${finalPath}.partial`;

  if (isSourceUrl(src)) {
    const url = interpolate(src.url, vars);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    if (res.body) {
      await pipeline(
        Readable.fromWeb(res.body as unknown as NodeReadableStream),
        createWriteStream(tmpPath),
      );
    } else {
      await writeFile(tmpPath, '');
    }
  } else if (isSourceFile(src)) {
    await copyFile(interpolate(src.file, vars), tmpPath);
  } else if (isSourceString(src)) {
    await writeFile(tmpPath, src.string);
  } else {
    throw new Error(`Unsupported source for ${artifact.path}`);
  }

  await rename(tmpPath, finalPath);
}

/** Run `fn` over `items` with at most `n` workers in parallel. */
async function pool<T>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(n, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx]!);
      }
    },
  );
  await Promise.all(workers);
}

export async function fetchAll(
  tasks: FetchTask[],
  vars: Record<string, string>,
  concurrency: number,
  onDone?: (task: FetchTask) => void,
): Promise<void> {
  await pool(tasks, concurrency, async (t) => {
    await fetchOne(t, vars);
    onDone?.(t);
  });
}
