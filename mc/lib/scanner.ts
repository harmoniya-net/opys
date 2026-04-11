import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import {
  type HashEntry,
  Integrity,
  Source,
  Unifact,
  UnifactSize,
  interpolate,
  type OverrideConfig,
} from '@unifest/core';
import { Ruleset } from '@unifest/rules';

export interface ArtifactScannerOptions {
  directory: string;
  /** CDN URL template. Available vars: ${path}, ${filename}, ${dir}. Used in build mode. */
  url: string;
  /** Destination path template. Available vars: ${path}, ${filename}, ${dir}. Defaults to '${path}'. */
  base_path?: string;
  hash?: 'sha1' | 'sha256';
  mode: 'build' | 'launch';
  overrides?: OverrideConfig[];
}

type FileEntry = { rel: string; abs: string; size: number };

function globMatches(pattern: string, path: string): boolean {
  const re = pattern
    .replace(/[.+^${}()|[\]\\*]/g, '\\$&')
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*');
  return new RegExp(`^${re}$`).test(path);
}

async function walkDir(dir: string): Promise<FileEntry[]> {
  async function walk(cur: string): Promise<FileEntry[]> {
    const entries = await readdir(cur, { withFileTypes: true });
    const results = await Promise.all(
      entries.map(async (entry) => {
        const abs = join(cur, entry.name);
        if (entry.isDirectory()) return walk(abs);
        if (entry.isFile()) {
          const { size } = await stat(abs);
          const rel = relative(dir, abs).replace(/\\/g, '/');
          return [{ rel, abs, size }] satisfies FileEntry[];
        }
        return [] as FileEntry[];
      }),
    );
    return results.flat();
  }
  return walk(dir);
}

async function hashFile(
  path: string,
  algo: 'sha1' | 'sha256',
): Promise<string> {
  const data = await readFile(path);
  return createHash(algo).update(data).digest('hex');
}

/**
 * Scan a directory and yield one {@link Unifact} per file, hashing as it goes.
 *
 * In `build` mode each artifact's source is set to its CDN URL (from `options.url`).
 * In `launch` mode the source is the file's absolute path on disk — no download needed.
 *
 * The `base_path` template controls the destination path stored in the manifest.
 * Use `'${root}/${path}'` to install files under the runtime `root` variable.
 */
export async function* artifactScanner(
  options: ArtifactScannerOptions,
): AsyncGenerator<Unifact> {
  const algo = options.hash ?? 'sha1';
  const basePathTemplate = options.base_path ?? '${path}';
  const overrides = options.overrides ?? [];

  const files = await walkDir(options.directory);

  for (const file of files) {
    const override = overrides.find((o) => globMatches(o.path, file.rel));
    if (override?.exclude) continue;

    const d = dirname(file.rel);
    const vars = {
      path: file.rel,
      abs: file.abs,
      filename: basename(file.rel),
      dir: d === '.' ? '' : d,
    };
    const artifactPath = interpolate(basePathTemplate, vars);

    const artifactSource =
      options.mode === 'launch'
        ? Source.file(file.abs)
        : Source.url(interpolate(override?.url ?? options.url, vars));

    let integrity: Integrity;
    if (override?.hashes?.length) {
      integrity = Integrity.of(override.hashes as HashEntry[]);
    } else {
      const digest = await hashFile(file.abs, algo);
      const computed: HashEntry =
        algo === 'sha1' ? { sha1: digest } : { sha256: digest };
      const entries = override?.extra_hashes
        ? [computed, ...(override.extra_hashes as HashEntry[])]
        : [computed];
      integrity = Integrity.of(entries);
    }

    yield new Unifact(
      artifactPath,
      artifactSource,
      UnifactSize.exact(file.size),
      Ruleset.empty(),
      integrity,
      undefined,
      undefined,
    );
  }
}
