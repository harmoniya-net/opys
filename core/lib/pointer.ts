import { z } from 'zod';
import {
  type Source,
  SourceWireSchema,
  decodeSource,
  encodeSource,
} from './source';
import {
  type Integrity,
  IntegrityWireSchema,
  encodeIntegrity,
} from './integrity';

/**
 * The JSON document a `pointer` source resolves to. A maintainer publishes
 * one at a stable URL and overwrites it on every release; the installer
 * fetches it fresh each run, so the manifest always tracks the current
 * version without re-baking.
 *
 * `integrity` is what makes this safe: the descriptor is fetched over an
 * unverified channel (TLS aside), but the artifact it names is still
 * verified against the hash *in that freshly-fetched descriptor*. Omit
 * `integrity` only for a fully trusted, unpinnable channel.
 */
export interface PointerDescriptor {
  /** The concrete source to download. May itself be another `pointer`. */
  readonly source: Source;
  readonly integrity?: Integrity;
  readonly size?: number;
}

/** Wire shape — what a pointer descriptor looks like as JSON. */
export const PointerDescriptorWireSchema = z.object({
  source: SourceWireSchema,
  integrity: IntegrityWireSchema.optional(),
  size: z.number().int().nonnegative().optional(),
});
export type PointerDescriptorWire = z.infer<typeof PointerDescriptorWireSchema>;

/** Total decode of a validated wire descriptor. */
export function decodePointerDescriptor(
  raw: PointerDescriptorWire,
): PointerDescriptor {
  return {
    source: decodeSource(raw.source),
    ...(raw.integrity !== undefined ? { integrity: raw.integrity } : {}),
    ...(raw.size !== undefined ? { size: raw.size } : {}),
  };
}

export function parsePointerDescriptor(input: string): PointerDescriptor {
  let json: unknown;
  try {
    json = JSON.parse(input);
  } catch (err) {
    throw new Error(
      `Pointer descriptor is not valid JSON: ${(err as Error).message}`,
    );
  }
  return decodePointerDescriptor(PointerDescriptorWireSchema.parse(json));
}

export function encodePointerDescriptor(
  d: PointerDescriptor,
): PointerDescriptorWire {
  return {
    source: encodeSource(d.source),
    ...(d.integrity ? { integrity: encodeIntegrity(d.integrity) } : {}),
    ...(d.size !== undefined ? { size: d.size } : {}),
  };
}
