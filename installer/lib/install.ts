import { existsSync, readdirSync } from 'node:fs';
import {
  resolveVars,
  resolveValDefs,
  filterManifest,
  interpolate,
  type Artifact,
} from '@torba/core';
import { currentPlatform } from './platform';
import type { OsOptions } from '@torba/rules';
import { resolveManifest, type ManifestSource } from './phases/resolve';
import { scan } from './phases/scan';
import { fetchAll, type FetchTask } from './phases/fetch';
import { verifyAll } from './phases/verify';
import {
  extractAll,
  EXTRACT_MARKER_SUFFIX,
  type ExtractTask,
} from './phases/extract';
import { sweep } from './phases/sweep';
import { IntegrityError } from './errors';
import { DEFAULT_CONCURRENCY } from './constants';

/**
 * True if extract for this artifact hasn't completed — i.e. a prior install
 * was interrupted between download and extract. Lets us re-run extract on
 * pre-existing source files.
 *
 * Detection is layered:
 *   1. Marker file (`<finalPath>.torba-extracted`) written by `extractAll`
 *      after every rule for an artifact has succeeded. Authoritative.
 *   2. Fallback for installs predating the marker: scan each rule's target.
 *      For `pick` we check the picked file. For `dump`/`scan` we look for
 *      any non-dotfile child — the archive cache (often `.cache/`) lives
 *      inside the extract target for some templates (`@torba/java`),
 *      so a plain "dir is empty" check would falsely satisfy on a download-
 *      only state where only the dotfile cache subdir exists.
 */
function extractIsPending(
  artifact: Artifact,
  finalPath: string,
  vars: Record<string, string>,
): boolean {
  if (!artifact.extract) return false;
  if (existsSync(`${finalPath}${EXTRACT_MARKER_SUFFIX}`)) return false;
  for (const rule of artifact.extract) {
    if (rule.kind === 'pick') {
      if (!existsSync(interpolate(rule.into, vars))) return true;
    } else {
      const dir = interpolate(rule.into, vars);
      if (!existsSync(dir)) return true;
      try {
        const entries = readdirSync(dir).filter((e) => !e.startsWith('.'));
        if (entries.length === 0) return true;
      } catch {
        return true;
      }
    }
  }
  return false;
}

export type { ManifestSource } from './phases/resolve';
export type InstallProgress =
  | { phase: 'resolve' }
  | { phase: 'download'; fetched: number; total: number; skipped: number }
  | { phase: 'download:start'; path: string; total: number }
  | { phase: 'download:bytes'; path: string; bytes: number }
  | { phase: 'download:done'; path: string }
  | { phase: 'verify' }
  | { phase: 'extract'; count: number }
  | { phase: 'sweep'; removed: number };

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

  await fetchAll(fetchTasks, vars, concurrency, {
    onStart: (t) =>
      onProgress?.({
        phase: 'download:start',
        path: t.artifact.path,
        total: t.artifact.size ?? 0,
      }),
    onBytes: (t, bytes) =>
      onProgress?.({
        phase: 'download:bytes',
        path: t.artifact.path,
        bytes,
      }),
    onDone: (t) => {
      fresh.add(t.finalPath);
      fetched++;
      onProgress?.({ phase: 'download:done', path: t.artifact.path });
      onProgress?.({
        phase: 'download',
        fetched,
        total: fetchTasks.length,
        skipped,
      });
    },
  });

  if (verifyIntegrity) {
    onProgress?.({ phase: 'verify' });
    const failures = await verifyAll(
      tasks.map((t) => ({ finalPath: t.finalPath, artifact: t.artifact })),
    );
    if (failures.length > 0) throw new IntegrityError(failures);
  }

  // Extract candidates: every applicable artifact with extract rules whose
  // file is on disk. Schedule it if it's freshly downloaded OR if any of
  // its extract destinations are still missing — the latter recovers from
  // installs that crashed after download but before extract.
  const applicable = filterManifest(manifest, platform).artifacts;
  const extractTasks: ExtractTask[] = [];
  for (const artifact of applicable) {
    if (!artifact.extract) continue;
    const finalPath = interpolate(artifact.path, vars);
    if (fresh.has(finalPath) || extractIsPending(artifact, finalPath, vars)) {
      extractTasks.push({ finalPath, artifact });
    }
  }

  if (extractTasks.length > 0) {
    onProgress?.({ phase: 'extract', count: extractTasks.length });
    await extractAll(extractTasks, vars);
  }

  if (manifest.restrict && manifest.restrict.length > 0) {
    const managed = new Set<string>(
      applicable.map((a) => interpolate(a.path, vars)),
    );
    const result = await sweep(manifest.restrict, vars, { managed });
    if (result.removed.length > 0) {
      onProgress?.({ phase: 'sweep', removed: result.removed.length });
    }
  }
}
