import { existsSync } from 'node:fs';
import type { Artifact, Manifest } from '@torba/core';
import { filterManifest } from '@torba/core';
import { interpolate } from '@torba/core';
import type { OsOptions } from '@torba/rules';

export interface ScanTask {
  artifact: Artifact;
  finalPath: string;
  idx: number;
}

export interface ScanResult {
  tasks: ScanTask[];
  skipped: number;
}

export function scan(
  manifest: Manifest,
  vars: Record<string, string>,
  platform: OsOptions,
): ScanResult {
  const applicable = filterManifest(manifest, platform);
  const tasks: ScanTask[] = [];
  let skipped = 0;

  for (let i = 0; i < applicable.artifacts.length; i++) {
    const u = applicable.artifacts[i]!;
    const finalPath = interpolate(u.path, vars);
    if (existsSync(finalPath)) {
      skipped++;
      continue;
    }
    tasks.push({ artifact: u, finalPath, idx: i });
  }

  return { tasks, skipped };
}
