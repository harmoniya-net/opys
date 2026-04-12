import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveVars, resolveValDefs, interpolate } from '@unifest/core';
import { currentPlatform } from './platform';
import type { OsOptions } from '@unifest/rules';
import { resolveManifest, type ManifestSource } from './phases/resolve';
import { scan, type ScanResult } from './phases/scan';
import { fetchAll, type FetchTask } from './phases/fetch';
import { verifyAll } from './phases/verify';
import { extractAll, type ExtractTask } from './phases/extract';
import { IntegrityError } from './errors';

export type { ManifestSource } from './phases/resolve';
export type InstallProgress =
  | { phase: 'resolve' }
  | { phase: 'download'; fetched: number; total: number; skipped: number }
  | { phase: 'verify' }
  | { phase: 'extract'; count: number };

export interface InstallOptions {
  platform?: OsOptions;
  vars?: Record<string, string>;
  concurrency?: number;
  onProgress?: (p: InstallProgress) => void;
  verifyIntegrity?: boolean;
}

const DEFAULT_CONCURRENCY = 8;
const MAX_ATTEMPTS = 3;

export async function install(
  source: ManifestSource,
  options: InstallOptions = {},
): Promise<void> {
  const {
    vars: extraVars = {},
    concurrency = DEFAULT_CONCURRENCY,
    onProgress,
    verifyIntegrity = true,
  } = options;
  const platform = options.platform ?? currentPlatform();

  onProgress?.({ phase: 'resolve' });
  const manifest = await resolveManifest(source);
  const flatVars = { ...resolveValDefs(manifest.vars, platform), ...extraVars };
  const vars = resolveVars(flatVars);

  const { tasks, skipped } = scan(manifest, vars, platform);
  const fresh = new Set<string>();
  const staging = join(tmpdir(), `unifest-${process.pid}`);
  await mkdir(staging, { recursive: true });

  try {
    let remaining = tasks;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt === 1) {
        onProgress?.({
          phase: 'download',
          fetched: 0,
          total: remaining.length,
          skipped,
        });
      }

      if (remaining.length > 0) {
        const fetchTasks: FetchTask[] = remaining.map((t, i) => ({
          unifact: t.unifact,
          finalPath: t.finalPath,
          tmpPath: join(staging, String(i)),
        }));
        await fetchAll(fetchTasks, vars, concurrency);
        for (const t of fetchTasks) fresh.add(t.finalPath);
        onProgress?.({
          phase: 'download',
          fetched: tasks.length,
          total: tasks.length,
          skipped,
        });
      }

      if (verifyIntegrity) {
        onProgress?.({ phase: 'verify' });
        const failures = await verifyAll(
          tasks.map((t) => ({ finalPath: t.finalPath, unifact: t.unifact })),
        );
        if (failures.length === 0) break;
        if (attempt === MAX_ATTEMPTS) throw new IntegrityError(failures);
        await Promise.all(failures.map((p) => rm(p, { force: true })));
        remaining = tasks.filter((t) => failures.includes(t.finalPath));
      } else {
        break;
      }
    }

    const extractTasks: ExtractTask[] = tasks
      .filter((t) => t.unifact.extract && fresh.has(t.finalPath))
      .map((t) => ({ finalPath: t.finalPath, unifact: t.unifact }));

    if (extractTasks.length > 0) {
      onProgress?.({ phase: 'extract', count: extractTasks.length });
      await extractAll(extractTasks, vars);
    }
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {
      // best-effort cleanup — OS will reclaim /tmp on reboot
    });
  }
}
