import { z } from 'zod';

/**
 * Where a discovered hash sits, keyed by algorithm. The string is a
 * *location* (a header name, or a URL), not the hash itself — torba reads
 * it at install time. Naming exactly one of `sha256`/`sha1`/`md5` also
 * tells torba which algorithm to expect.
 */
export type HashRef =
  | { readonly sha256: string }
  | { readonly sha1: string }
  | { readonly md5: string };

/** Ordered probes for an artifact's hash — `header` is tried before `url`. */
export interface IntegrityProbes {
  /** Response header carrying the hash (e.g. RFC 9530 `Repr-Digest`). */
  readonly header?: HashRef;
  /**
   * A URL whose body contains the hash. `${url}` expands to the artifact's
   * own source URL; `${var}` interpolation also applies. The hash is matched
   * out of the body, so `sha256sum` / `SHA256SUMS` output is fine.
   */
  readonly url?: HashRef;
}

export interface SizeProbes {
  /** Response header carrying the byte count (usually `Content-Length`). */
  readonly header?: string;
}

/**
 * Declares how to discover an artifact's metadata from the upstream itself,
 * at install time, instead of baking it into the manifest. Lets a manifest
 * reference a moving 3rd-party URL and still verify it: the author names the
 * host's existing checksum convention, and torba runs it on every install —
 * a discovered hash both verifies the download and decides freshness
 * (matches the local copy → skip; differs → refetch).
 *
 * Only valid on a `url` source.
 */
export interface Discovery {
  readonly integrity?: IntegrityProbes;
  readonly size?: SizeProbes;
}

const HashRefSchema: z.ZodType<HashRef> = z.union([
  z.object({ sha256: z.string() }),
  z.object({ sha1: z.string() }),
  z.object({ md5: z.string() }),
]) as unknown as z.ZodType<HashRef>;

export const DiscoverySchema: z.ZodType<Discovery> = z.object({
  integrity: z
    .object({
      header: HashRefSchema.optional(),
      url: HashRefSchema.optional(),
    })
    .optional(),
  size: z
    .object({
      header: z.string().optional(),
    })
    .optional(),
}) as unknown as z.ZodType<Discovery>;

export function encodeDiscovery(d: Discovery): unknown {
  const out: Record<string, unknown> = {};
  if (d.integrity) {
    const i: Record<string, unknown> = {};
    if (d.integrity.header) i.header = d.integrity.header;
    if (d.integrity.url) i.url = d.integrity.url;
    out.integrity = i;
  }
  if (d.size) {
    const s: Record<string, unknown> = {};
    if (d.size.header) s.header = d.size.header;
    out.size = s;
  }
  return out;
}
