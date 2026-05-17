import { z } from 'zod';

export type HashEntry = { sha1: string } | { sha256: string } | { md5: string };

/** One entry, multiple entries, or omitted (= skip verification). */
export type Integrity = HashEntry | HashEntry[];

const HashEntrySchema = z.union([
  z.object({ sha1: z.string() }),
  z.object({ sha256: z.string() }),
  z.object({ md5: z.string() }),
]);

/** Wire shape — identical to the domain shape, so decode is the identity. */
export const IntegrityWireSchema = z.union([
  HashEntrySchema,
  z.array(HashEntrySchema),
]);
export type IntegrityWire = z.infer<typeof IntegrityWireSchema>;

export function encodeIntegrity(i: Integrity): IntegrityWire {
  if (Array.isArray(i)) return i.length === 1 ? i[0]! : i;
  return i;
}

/** Normalize to an array of hash entries; undefined → []. */
export function integrityHashes(i: Integrity | undefined): HashEntry[] {
  if (i === undefined) return [];
  return Array.isArray(i) ? i : [i];
}

export type HashAlgo = 'sha1' | 'sha256' | 'md5';
