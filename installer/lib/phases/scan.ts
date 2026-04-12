import { existsSync } from 'node:fs';
import type { Unifact, Unifest } from '@unifest/core';
import { filterUnifest, isSourceEmpty } from '@unifest/core';
import { interpolate, resolveVars } from '@unifest/core';
import type { OsOptions } from '@unifest/rules';

export interface ScanTask {
  unifact: Unifact;
  finalPath: string;
  idx: number;
}

export interface ScanResult {
  tasks: ScanTask[];
  skipped: number;
}

export function scan(
  manifest: Unifest,
  vars: Record<string, string>,
  platform: OsOptions,
): ScanResult {
  const applicable = filterUnifest(manifest, platform);
  const tasks: ScanTask[] = [];
  let skipped = 0;

  for (let i = 0; i < applicable.unifacts.length; i++) {
    const u = applicable.unifacts[i]!;
    if (isSourceEmpty(u.source)) {
      skipped++;
      continue;
    }
    const finalPath = interpolate(u.path, vars);
    if (existsSync(finalPath)) {
      skipped++;
      continue;
    }
    tasks.push({ unifact: u, finalPath, idx: i });
  }

  return { tasks, skipped };
}
