/**
 * Tar reader built on the `tar-stream` library. Supports:
 *
 *   - Regular files — emitted as `file` entries with content + mode
 *   - Directories — skipped (mkdir is implicit on file write)
 *   - Symlinks — emitted as `linkTarget` entries
 *   - USTAR `prefix` field — `tar-stream` joins it into `header.name` for us
 *   - PAX extended / GNU long-name headers — handled internally by `tar-stream`
 *
 * Other entry types (block/char devices, FIFOs, hardlinks) are
 * intentionally skipped rather than throwing — they don't appear in the
 * OpenJDK distributions we care about, and silently ignoring keeps the
 * path open for future archive shapes.
 */

import { gunzipSync } from 'fflate';
import tarStream from 'tar-stream';

export interface TarFileEntry {
  readonly kind: 'file';
  readonly name: string;
  readonly content: Uint8Array;
  /** Mode bits (octal in tar header). 0 if unset. */
  readonly mode: number;
}

export interface TarSymlinkEntry {
  readonly kind: 'symlink';
  readonly name: string;
  readonly linkTarget: string;
}

export type TarEntry = TarFileEntry | TarSymlinkEntry;

/**
 * Parse raw (already-decompressed) tar bytes into a list of entries.
 * Stream-driven via `tar-stream`, hence async.
 */
export function readTar(data: Uint8Array): Promise<TarEntry[]> {
  return new Promise<TarEntry[]>((resolve, reject) => {
    const entries: TarEntry[] = [];
    const extract = tarStream.extract();

    extract.on('entry', (header, stream, next) => {
      const name = header.name;

      if (header.type === 'symlink') {
        entries.push({
          kind: 'symlink',
          name,
          linkTarget: header.linkname ?? '',
        });
        // Symlink entries have no body, but drain defensively.
        stream.on('end', next);
        stream.on('error', reject);
        stream.resume();
        return;
      }

      if (header.type === 'file') {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => {
          const content = new Uint8Array(Buffer.concat(chunks));
          entries.push({
            kind: 'file',
            name,
            content,
            mode: header.mode ?? 0,
          });
          next();
        });
        return;
      }

      // Directories and any other entry type: skip, but still drain.
      stream.on('end', next);
      stream.on('error', reject);
      stream.resume();
    });

    extract.on('error', reject);
    extract.on('finish', () => resolve(entries));

    extract.end(Buffer.from(data));
  });
}

/** Detect tar.gz/.tgz/.tar from a path. */
export function isTarPath(path: string): boolean {
  return (
    path.endsWith('.tar.gz') || path.endsWith('.tgz') || path.endsWith('.tar')
  );
}

/**
 * Read a tar (or gzipped tar) archive into a list of entries.
 * Decompresses gzip in-memory via fflate — `tar-stream` does not gunzip.
 */
export function readTarArchive(
  path: string,
  data: Uint8Array,
): Promise<TarEntry[]> {
  let bytes: Uint8Array;
  if (path.endsWith('.tar.gz') || path.endsWith('.tgz')) {
    bytes = gunzipSync(data);
  } else {
    bytes = data;
  }
  return readTar(bytes);
}
