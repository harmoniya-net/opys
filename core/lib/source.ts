import { z } from 'zod';

export type Source =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'file'; readonly file: string }
  | { readonly kind: 'string'; readonly string: string }
  | { readonly kind: 'empty' };

const SourceRawSchema = z.union([
  z.object({ url: z.string() }),
  z.object({ file: z.string() }),
  z.object({ string: z.string() }),
  z.literal('empty'),
]);

export const SourceSchema: z.ZodType<Source> = SourceRawSchema.transform(
  (raw): Source => {
    if (raw === 'empty') return { kind: 'empty' };
    if ('url' in raw) return { kind: 'url', url: raw.url };
    if ('file' in raw) return { kind: 'file', file: raw.file };
    return { kind: 'string', string: raw.string };
  },
) as unknown as z.ZodType<Source>;

export function encodeSource(source: Source): unknown {
  if (source.kind === 'empty') return 'empty';
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
export const sourceEmpty = (): Source => ({ kind: 'empty' });

// Type guards
export const isSourceUrl = (s: Source): s is Extract<Source, { kind: 'url' }> =>
  s.kind === 'url';
export const isSourceFile = (
  s: Source,
): s is Extract<Source, { kind: 'file' }> => s.kind === 'file';
export const isSourceString = (
  s: Source,
): s is Extract<Source, { kind: 'string' }> => s.kind === 'string';
export const isSourceEmpty = (
  s: Source,
): s is Extract<Source, { kind: 'empty' }> => s.kind === 'empty';
