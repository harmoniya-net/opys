import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Artifact } from '@torba/core';
import { extractDump } from '@torba/core';
import { interpolate } from '@torba/core';
import { extractZip } from '../zip';

export interface ExtractTask {
  finalPath: string;
  artifact: Artifact;
}

export async function extractAll(
  tasks: ExtractTask[],
  vars: Record<string, string>,
): Promise<void> {
  const cleaned = new Set<string>();
  for (const { finalPath, artifact } of tasks) {
    if (!artifact.extract) continue;
    for (const rule of artifact.extract) {
      if (rule.kind === 'dump') {
        const targetDir = interpolate(rule.into, vars);
        if (rule.clean && !cleaned.has(targetDir)) {
          await rm(targetDir, { recursive: true, force: true });
          cleaned.add(targetDir);
        }
        await mkdir(targetDir, { recursive: true });
        await extractZip(
          finalPath,
          targetDir,
          rule.includes,
          rule.excludes ?? ['META-INF/'],
        );
      }
    }
  }
}
