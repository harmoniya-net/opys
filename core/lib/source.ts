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

const SourceRawSchema = z.union([
  z.object({ url: z.string() }),
  z.object({ file: z.string() }),
  z.object({ string: z.string() }),
  z.object({ bytes: z.string() }),
  z.object({ pointer: z.string() }),
]);

export const SourceSchema: z.ZodType<Source> = SourceRawSchema.transform(
  (raw): Source => {
    if ('url' in raw) return { kind: 'url', url: raw.url };
    if ('file' in raw) return { kind: 'file', file: raw.file };
    if ('string' in raw) return { kind: 'string', string: raw.string };
    if ('pointer' in raw) return { kind: 'pointer', pointer: raw.pointer };
    return { kind: 'bytes', bytes: raw.bytes };
  },
) as unknown as z.ZodType<Source>;

export function encodeSource(source: Source): unknown {
  const { kind, ...rest } = source;
  return rest;
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
