/**
 * Minimal tar reader. Supports:
 *
 *   - Regular files (typeflag `0` or `\0`)
 *   - Directories (typeflag `5`) — skipped (mkdir is implicit on file write)
 *   - Symlinks (typeflag `2`) — emitted as `linkTarget` entries
 *   - USTAR `prefix` field — concatenated with `name` to extend the path budget to ~256 chars
 *   - PAX extended headers (typeflag `x`/`g`) — skipped
 *
 * Other typeflags (block/char devices, FIFOs, GNU long-name extensions)
 * are intentionally skipped with a warning rather than throwing —
 * they don't appear in the OpenJDK distributions we care about, and
 * silently ignoring keeps the path open for future archive shapes.
 */

import { gunzipSync } from 'fflate';

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

const BLOCK_SIZE = 512;
const decoder = new TextDecoder('utf-8');

function readCString(buf: Uint8Array, offset: number, maxLen: number): string {
  let end = offset;
  const limit = Math.min(offset + maxLen, buf.length);
  while (end < limit && buf[end] !== 0) end++;
  return decoder.decode(buf.subarray(offset, end));
}

function parseOctal(buf: Uint8Array, offset: number, maxLen: number): number {
  const s = readCString(buf, offset, maxLen).trim();
  if (!s) return 0;
  const n = parseInt(s, 8);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Iterate tar entries from raw bytes. Stops at the first all-zero
 * header block (tar's archive-end marker).
 */
export function* readTar(data: Uint8Array): Iterable<TarEntry> {
  let off = 0;
  while (off + BLOCK_SIZE <= data.length) {
    const header = data.subarray(off, off + BLOCK_SIZE);
    // End-of-archive: a block of zeros.
    let allZero = true;
    for (let i = 0; i < BLOCK_SIZE; i++) {
      if (header[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) break;

    const nameRaw = readCString(header, 0, 100);
    const mode = parseOctal(header, 100, 8);
    const size = parseOctal(header, 124, 12);
    const typeflag = String.fromCharCode(header[156] || 0x30);
    const linkname = readCString(header, 157, 100);
    const prefix = readCString(header, 345, 155);
    const fullName = prefix ? `${prefix}/${nameRaw}` : nameRaw;

    off += BLOCK_SIZE;
    const dataLen = size;
    const padded = Math.ceil(dataLen / BLOCK_SIZE) * BLOCK_SIZE;

    if (typeflag === '0' || typeflag === '\0') {
      const content = data.slice(off, off + dataLen);
      yield { kind: 'file', name: fullName, content, mode };
    } else if (typeflag === '2') {
      yield { kind: 'symlink', name: fullName, linkTarget: linkname };
    }
    // typeflag '5' (directory), 'x'/'g' (pax), 'L'/'K' (gnu) and others
    // intentionally fall through — we still advance `off` past the data.

    off += padded;
  }
}

/** Detect tar.gz/.tgz/.tar from a path. */
export function isTarPath(path: string): boolean {
  return (
    path.endsWith('.tar.gz') || path.endsWith('.tgz') || path.endsWith('.tar')
  );
}

/**
 * Read a tar (or gzipped tar) archive into a list of entries.
 * Decompresses gzip in-memory via fflate.
 */
export function readTarArchive(path: string, data: Uint8Array): TarEntry[] {
  let bytes: Uint8Array;
  if (path.endsWith('.tar.gz') || path.endsWith('.tgz')) {
    bytes = gunzipSync(data);
  } else {
    bytes = data;
  }
  return [...readTar(bytes)];
}
