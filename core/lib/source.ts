import { z } from 'zod';

export type Source =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'file'; readonly file: string }
  | { readonly kind: 'string'; readonly string: string }
  | { readonly kind: 'bytes'; readonly bytes: string }
  /**
   * Indirection: `pointer` is the URL of a JSON descriptor (see
   * `PointerDescriptor`) that names the real source + integrity. Resolved
   * at install time, so the manifest tracks an evolving upstream — e.g. a
   * translation pack repo that publishes a "latest" descriptor.
   */
  | { readonly kind: 'pointer'; readonly pointer: string };

/** Wire shape — what a `source` looks like in `torba.json`. */
export const SourceWireSchema = z.union([
  z.object({ url: z.string() }),
  z.object({ file: z.string() }),
  z.object({ string: z.string() }),
  z.object({ bytes: z.string() }),
  z.object({ pointer: z.string() }),
]);
export type SourceWire = z.infer<typeof SourceWireSchema>;

/** Total decode: every valid wire value maps to a domain `Source`. */
export function decodeSource(raw: SourceWire): Source {
  if ('url' in raw) return { kind: 'url', url: raw.url };
  if ('file' in raw) return { kind: 'file', file: raw.file };
  if ('string' in raw) return { kind: 'string', string: raw.string };
  if ('pointer' in raw) return { kind: 'pointer', pointer: raw.pointer };
  return { kind: 'bytes', bytes: raw.bytes };
}

export function encodeSource(source: Source): SourceWire {
  switch (source.kind) {
    case 'url':
      return { url: source.url };
    case 'file':
      return { file: source.file };
    case 'string':
      return { string: source.string };
    case 'bytes':
      return { bytes: source.bytes };
    case 'pointer':
      return { pointer: source.pointer };
  }
}

// Factory functions
export const sourceUrl = (url: string): Source => ({ kind: 'url', url });
export const sourceFile = (file: string): Source => ({ kind: 'file', file });
export const sourceString = (string: string): Source => ({
  kind: 'string',
  string,
});
export const sourceBytes = (bytes: Uint8Array): Source => ({
  kind: 'bytes',
  bytes: Buffer.from(bytes).toString('base64'),
});
export const sourcePointer = (pointer: string): Source => ({
  kind: 'pointer',
  pointer,
});

// Type guards
export const isSourceUrl = (s: Source): s is Extract<Source, { kind: 'url' }> =>
  s.kind === 'url';
export const isSourceFile = (
  s: Source,
): s is Extract<Source, { kind: 'file' }> => s.kind === 'file';
export const isSourceString = (
  s: Source,
): s is Extract<Source, { kind: 'string' }> => s.kind === 'string';
export const isSourceBytes = (
  s: Source,
): s is Extract<Source, { kind: 'bytes' }> => s.kind === 'bytes';
export const isSourcePointer = (
  s: Source,
): s is Extract<Source, { kind: 'pointer' }> => s.kind === 'pointer';
