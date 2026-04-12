import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Unifact } from '@unifest/core';
import { extractDump } from '@unifest/core';
import { interpolate } from '@unifest/core';
import { extractZip } from '../zip';

export interface ExtractTask {
  finalPath: string;
  unifact: Unifact;
}

export async function extractAll(
  tasks: ExtractTask[],
  vars: Record<string, string>,
): Promise<void> {
  const cleaned = new Set<string>();
  for (const { finalPath, unifact } of tasks) {
    if (!unifact.extract) continue;
    for (const rule of unifact.extract) {
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
