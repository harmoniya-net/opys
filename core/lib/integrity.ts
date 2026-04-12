import { z } from 'zod';

const HashEntrySchema = z.union([
  z.object({ sha1: z.string() }),
  z.object({ sha256: z.string() }),
]);

export type HashEntry = z.infer<typeof HashEntrySchema>;

export type Integrity =
  | { readonly kind: 'skip' }
  | { readonly kind: 'hashes'; readonly entries: ReadonlyArray<HashEntry> };

const IntegrityRawSchema = z.union([
  z.literal('skip'),
  HashEntrySchema,
  z.array(HashEntrySchema),
]);

export const IntegritySchema: z.ZodType<Integrity> =
  IntegrityRawSchema.transform((raw): Integrity => {
    if (raw === 'skip') return { kind: 'skip' };
    const entries = Array.isArray(raw) ? raw : [raw];
    return { kind: 'hashes', entries };
  }) as unknown as z.ZodType<Integrity>;

export function encodeIntegrity(i: Integrity): unknown {
  if (i.kind === 'skip') return 'skip';
  if (i.entries.length === 1) return i.entries[0];
  return [...i.entries];
}

// Factory functions
export const skipIntegrity = (): Integrity => ({ kind: 'skip' });
export const sha1Integrity = (hash: string): Integrity => ({
  kind: 'hashes',
  entries: [{ sha1: hash }],
});
export const sha256Integrity = (hash: string): Integrity => ({
  kind: 'hashes',
  entries: [{ sha256: hash }],
});
export const ofIntegrity = (entries: HashEntry[]): Integrity => ({
  kind: 'hashes',
  entries,
});

export function isIntegritySkip(i: Integrity): i is { kind: 'skip' } {
  return i.kind === 'skip';
}
