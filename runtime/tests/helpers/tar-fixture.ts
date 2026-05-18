/** Test-only USTAR tar archive builder. Not a test file. */

const enc = new TextEncoder();

export interface TarEntrySpec {
  name: string;
  content?: string;
  mode?: number;
  typeflag?: string;
  linkname?: string;
  prefix?: string;
}

/** Build one 512-byte USTAR header block with a valid checksum. */
function tarHeader(e: TarEntrySpec, size: number): Uint8Array {
  const h = new Uint8Array(512);
  const put = (s: string, off: number, len: number) =>
    h.set(enc.encode(s).subarray(0, len), off);
  const octal = (v: number, len: number) =>
    v.toString(8).padStart(len - 1, '0') + '\0';

  put(e.name, 0, 100);
  put(octal(e.mode ?? 0o644, 8), 100, 8);
  put(octal(0, 8), 108, 8);
  put(octal(0, 8), 116, 8);
  put(octal(size, 12), 124, 12);
  put(octal(0, 12), 136, 12);
  for (let i = 148; i < 156; i++) h[i] = 0x20; // chksum placeholder
  h[156] = (e.typeflag ?? '0').charCodeAt(0);
  if (e.linkname) put(e.linkname, 157, 100);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  if (e.prefix) put(e.prefix, 345, 155);

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i]!;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

/** Assemble a tar archive, terminated by two zero blocks. */
export function buildTar(entries: TarEntrySpec[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const e of entries) {
    const body =
      e.content !== undefined ? enc.encode(e.content) : new Uint8Array(0);
    blocks.push(tarHeader(e, body.length));
    if (body.length > 0) {
      const padded = new Uint8Array(Math.ceil(body.length / 512) * 512);
      padded.set(body);
      blocks.push(padded);
    }
  }
  blocks.push(new Uint8Array(512), new Uint8Array(512));
  const total = blocks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of blocks) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}
