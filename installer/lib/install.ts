import { resolveVars, resolveValDefs } from '@torba/core';
import { currentPlatform } from './platform';
import type { OsOptions } from '@torba/rules';
import { resolveManifest, type ManifestSource } from './phases/resolve';
import { scan } from './phases/scan';
import { fetchAll, type FetchTask } from './phases/fetch';
import { verifyAll } from './phases/verify';
import { extractAll, type ExtractTask } from './phases/extract';
import { IntegrityError } from './errors';
import { DEFAULT_CONCURRENCY } from './constants';

export type { ManifestSource } from './phases/resolve';
export type InstallProgress =
  | { phase: 'resolve' }
  | { phase: 'download'; fetched: number; total: number; skipped: number }
  | { phase: 'download:done'; path: string }
  | { phase: 'verify' }
  | { phase: 'extract'; count: number };

export interface InstallOptions {
  platform?: OsOptions;
  vars?: Record<string, string>;
  concurrency?: number;
  onProgress?: (p: InstallProgress) => void;
  verifyIntegrity?: boolean;
}

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

  const fetchTasks: FetchTask[] = tasks.map((t) => ({
    artifact: t.artifact,
    finalPath: t.finalPath,
  }));

  let fetched = 0;
  onProgress?.({
    phase: 'download',
    fetched: 0,
    total: fetchTasks.length,
    skipped,
  });

  await fetchAll(fetchTasks, vars, concurrency, (t) => {
    fresh.add(t.finalPath);
    fetched++;
    onProgress?.({ phase: 'download:done', path: t.artifact.path });
    onProgress?.({
      phase: 'download',
      fetched,
      total: fetchTasks.length,
      skipped,
    });
  });

  if (verifyIntegrity) {
    onProgress?.({ phase: 'verify' });
    const failures = await verifyAll(
      tasks.map((t) => ({ finalPath: t.finalPath, artifact: t.artifact })),
    );
    if (failures.length > 0) throw new IntegrityError(failures);
  }

  const extractTasks: ExtractTask[] = tasks
    .filter((t) => t.artifact.extract && fresh.has(t.finalPath))
    .map((t) => ({ finalPath: t.finalPath, artifact: t.artifact }));

  if (extractTasks.length > 0) {
    onProgress?.({ phase: 'extract', count: extractTasks.length });
    await extractAll(extractTasks, vars);
  }
}
