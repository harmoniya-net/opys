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
    const res = await fetch(url);
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

export async function fetchAll(
  tasks: FetchTask[],
  vars: Record<string, string>,
  concurrency: number,
  onDone?: (task: FetchTask) => void,
): Promise<void> {
  // Largest-first: big files start early so workers stay saturated and
  // small files don't queue behind a long tail. Unknown size sinks to the end.
  const ordered = [...tasks].sort(
    (a, b) => (b.artifact.size ?? -1) - (a.artifact.size ?? -1),
  );

  let i = 0;
  const worker = async () => {
    while (i < ordered.length) {
      const task = ordered[i++]!;
      await fetchOne(task, vars);
      onDone?.(task);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, ordered.length) }, worker),
  );
}
