import { z } from 'zod';

export type UnifactSize =
  | { readonly kind: 'exact'; readonly bytes: number }
  | { readonly kind: 'at-least'; readonly bytes: number }
  | { readonly kind: 'unknown' };

const SizeRawSchema = z.union([
  z.object({ exact: z.number().int().nonnegative() }),
  z.object({ at_least: z.number().int().nonnegative() }),
  z.literal('unknown'),
]);

export const SizeSchema: z.ZodType<UnifactSize> = SizeRawSchema.transform(
  (raw): UnifactSize => {
    if (raw === 'unknown') return { kind: 'unknown' };
    if ('exact' in raw) return { kind: 'exact', bytes: raw.exact };
    return { kind: 'at-least', bytes: raw.at_least };
  },
) as unknown as z.ZodType<UnifactSize>;

export function encodeSize(s: UnifactSize): unknown {
  if (s.kind === 'unknown') return 'unknown';
  if (s.kind === 'exact') return { exact: s.bytes };
  return { at_least: s.bytes };
}

// Factory functions
export const exactSize = (bytes: number): UnifactSize => ({
  kind: 'exact',
  bytes,
});
export const atLeastSize = (bytes: number): UnifactSize => ({
  kind: 'at-least',
  bytes,
});
export const unknownSize = (): UnifactSize => ({ kind: 'unknown' });
export const zeroSize = (): UnifactSize => ({ kind: 'exact', bytes: 0 });

/**
 * Commutative monoid addition:
 *   exact(a) + exact(b)   = exact(a+b)
 *   atLeast(a) + exact(b) = atLeast(a+b)
 *   exact(a) + unknown    = atLeast(a)
 *   unknown + unknown     = atLeast(0)
 */
export function addSize(a: UnifactSize, b: UnifactSize): UnifactSize {
  if (a.kind === 'exact' && b.kind === 'exact')
    return { kind: 'exact', bytes: a.bytes + b.bytes };
  const aBytes = a.kind === 'unknown' ? 0 : a.bytes;
  const bBytes = b.kind === 'unknown' ? 0 : b.bytes;
  return { kind: 'at-least', bytes: aBytes + bBytes };
}

export function sizeBytes(s: UnifactSize): number | undefined {
  return s.kind === 'unknown' ? undefined : s.bytes;
}
