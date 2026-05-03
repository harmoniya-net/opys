import { z } from 'zod';

export type HashEntry = { sha1: string } | { sha256: string };

/** One entry, multiple entries, or omitted (= skip verification). */
export type Integrity = HashEntry | HashEntry[];

const HashEntrySchema: z.ZodType<HashEntry> = z.union([
  z.object({ sha1: z.string() }),
  z.object({ sha256: z.string() }),
]);

export const IntegritySchema: z.ZodType<Integrity> = z.union([
  HashEntrySchema,
  z.array(HashEntrySchema),
]);

export function encodeIntegrity(i: Integrity): unknown {
  if (Array.isArray(i)) return i.length === 1 ? i[0] : i;
  return i;
}

/** Normalize to an array of hash entries; undefined → []. */
export function integrityHashes(i: Integrity | undefined): HashEntry[] {
  if (i === undefined) return [];
  return Array.isArray(i) ? i : [i];
}
