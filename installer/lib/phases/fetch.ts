import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Unifact } from '@unifest/core';
import {
  isSourceUrl,
  isSourceFile,
  isSourceString,
  sizeBytes,
} from '@unifest/core';
import { interpolate } from '@unifest/core';

export interface FetchTask {
  unifact: Unifact;
  finalPath: string;
  tmpPath: string;
}

async function fetchToTmp(
  unifact: Unifact,
  tmpPath: string,
  vars: Record<string, string>,
): Promise<void> {
  const src = unifact.source;
  if (isSourceUrl(src)) {
    const url = interpolate(src.url, vars);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    await mkdir(dirname(tmpPath), { recursive: true });
    const ws = createWriteStream(tmpPath);
    if (res.body) await pipeline(Readable.fromWeb(res.body), ws);
  } else if (isSourceFile(src)) {
    const file = interpolate(src.file, vars);
    await mkdir(dirname(tmpPath), { recursive: true });
    const { readFile } = await import('node:fs/promises');
    await writeFile(tmpPath, await readFile(file));
  } else if (isSourceString(src)) {
    await mkdir(dirname(tmpPath), { recursive: true });
    await writeFile(tmpPath, src.string);
  } else {
    throw new Error(`Unsupported source for ${unifact.path}`);
  }
}

/** rename with EXDEV fallback — /tmp and the final path may be on different devices. */
async function renameCrossDevice(src: string, dst: string): Promise<void> {
  try {
    await rename(src, dst);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await copyFile(src, dst);
    await unlink(src);
  }
}

export async function fetchAll(
  tasks: FetchTask[],
  vars: Record<string, string>,
  concurrency: number,
): Promise<void> {
  const sem = new Semaphore(concurrency);
  await Promise.all(
    tasks.map((t) =>
      sem.use(async () => {
        await fetchToTmp(t.unifact, t.tmpPath, vars);
        await mkdir(dirname(t.finalPath), { recursive: true });
        await renameCrossDevice(t.tmpPath, t.finalPath);
      }),
    ),
  );
}

class Semaphore {
  private slots: number;
  private queue: Array<() => void> = [];
  constructor(private limit: number) {
    this.slots = limit;
  }
  async acquire(): Promise<void> {
    if (this.slots > 0) {
      this.slots--;
      return;
    }
    await new Promise<void>((r) => this.queue.push(r));
  }
  release(): void {
    this.slots++;
    const next = this.queue.shift();
    if (next) {
      this.slots--;
      next();
    }
  }
  async use<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
