import { existsSync } from 'node:fs';
import { readdir, rm, rmdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { interpolate, globBase, globToRegex } from '@torba/core';
import { EXTRACT_MARKER_SUFFIX } from './extract';

export interface SweepResult {
  /** Absolute paths deleted (files + pruned empty dirs). */
  removed: string[];
}

export interface SweepOptions {
  /**
   * Resolved manifest artifact `path` values (already var-interpolated).
   * Files matching a restrict glob whose absolute path is in this set
   * are kept. Anything else under the glob's base is removed.
   */
  managed: ReadonlySet<string>;
}

/**
 * Files torba writes as bookkeeping. Always preserved regardless of
 * restrict globs so we don't nuke our own state.
 */
function isTorbaInternal(absPath: string): boolean {
  if (absPath.endsWith(EXTRACT_MARKER_SUFFIX)) return true;
  // Archive caches written by `@torba/java`-style templates that put
  // their downloaded archive at `<targetDir>/.cache/<file>`. The cache
  // dir is always sibling-named `.cache`.
  return absPath.split(sep).some((seg) => seg === '.cache');
}

/**
 * Apply `manifest.restrict` globs: walk each glob's filesystem footprint,
 * delete any matching file that isn't in `managed`, then prune empty
 * directories left behind.
 *
 * Globs are normalized to forward slashes before matching, so behavior
 * is consistent across platforms even though the filesystem walk uses
 * native path separators.
 */
export async function sweep(
  globs: ReadonlyArray<string>,
  vars: Record<string, string>,
  options: SweepOptions,
): Promise<SweepResult> {
  const removed: string[] = [];
  if (globs.length === 0) return { removed };

  const compiled = globs.map((g) => {
    const interpolated = interpolate(g, vars);
    return {
      raw: g,
      pattern: interpolated,
      regex: globToRegex(interpolated),
      base: globBase(interpolated),
    };
  });

  // Group by base dir so we walk each base once even if multiple globs
  // share it (e.g. `${game_directory}/mods/**/*.jar` and `…/*.zip`).
  const byBase = new Map<string, RegExp[]>();
  for (const c of compiled) {
    if (!c.base) continue;
    const arr = byBase.get(c.base);
    if (arr) arr.push(c.regex);
    else byBase.set(c.base, [c.regex]);
  }

  for (const [base, regexes] of byBase) {
    if (!existsSync(base)) continue;
    await sweepDir(base, regexes, options.managed, removed);
    await pruneEmptyChildren(base, removed);
  }

  return { removed };
}

async function sweepDir(
  dir: string,
  regexes: RegExp[],
  managed: ReadonlySet<string>,
  removed: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      await sweepDir(abs, regexes, managed, removed);
      continue;
    }
    if (!entry.isFile()) continue;
    if (isTorbaInternal(abs)) continue;
    if (managed.has(abs)) continue;
    const normalized = abs.split(sep).join('/');
    if (regexes.some((rx) => rx.test(normalized))) {
      try {
        await rm(abs, { force: true });
        removed.push(abs);
      } catch {
        // best-effort; leave it for next run
      }
    }
  }
}

/**
 * Recursively prune empty directories *under* `root` (bottom-up) but
 * never the root itself — restrict bases are user-declared install
 * targets and should stay around even when momentarily empty.
 *
 * `.cache/` dirs are skipped: torba's own archive cache lives there
 * and is expected to persist across installs.
 */
async function pruneEmptyChildren(
  root: string,
  removed: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.cache') continue;
    const child = join(root, entry.name);
    await pruneEmptyChildren(child, removed);
    try {
      const after = await readdir(child);
      if (after.length === 0) {
        await rmdir(child);
        removed.push(child);
      }
    } catch {
      // best-effort
    }
  }
}
