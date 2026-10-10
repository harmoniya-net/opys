/**
 * `@opys/bundle` — the file a manifest is published as: a zip holding a
 * head, the manifest and the blobs it names. A thin wrapper over the
 * `opys-bundle` crate; the manifest itself is `@opys/core`'s.
 */

import { bundle as napi } from '@opys/binding';
import type { Manifest } from '@opys/core';
import { optionDefs, type OptionDef, type OptionsInput } from './options';

export * from './options';

/**
 * A bundle's first entry: what the bundle says about itself, apart from the
 * installation it carries. Small and uncompressed, so it is read without the
 * manifest beside it.
 */
export interface Head {
  /** The format the bundle is written in. A reader reads exactly one. */
  readonly format: number;
  /**
   * What whoever launches the bundle may choose: the variables and features
   * it leaves to them, and how to ask for each.
   */
  readonly options?: readonly OptionDef[];
}

/**
 * Where a blob's bytes are before they are in a bundle: a file, or bytes
 * (base64) made in memory. What `writeBundle` reads them from.
 */
export type BlobSource = { readonly file: string } | { readonly bytes: string };

/** Blob id → where its bytes are. */
export type Blobs = Readonly<Record<string, BlobSource>>;

export const blobFile = (file: string): BlobSource => ({ file });
export const blobBytes = (bytes: Uint8Array): BlobSource => ({
  bytes: Buffer.from(bytes).toString('base64'),
});

/** The id of the blob holding exactly `bytes`: the hex sha256 of them. */
export function blobId(bytes: Uint8Array): string {
  return napi.blobId(Buffer.from(bytes));
}

/** The id and size of the blob a file on disk would be. */
export function hashBlobFile(
  path: string,
): Promise<{ id: string; size: number }> {
  return napi.hashBlobFile(path) as Promise<{ id: string; size: number }>;
}

/** The bundle format this build reads and writes. */
export const BUNDLE_FORMAT: number = napi.bundleFormat();

/**
 * Write `manifest` and the blobs it names to `path` as a bundle. `blobs` may
 * hold more than the manifest names; a blob it names and `blobs` lacks is an
 * error. `head` is what the bundle says about itself beyond its format, which
 * is this build's; its options may still be the chain they were written as.
 */
export async function writeBundle(
  path: string,
  manifest: Manifest,
  blobs: Blobs = {},
  head: { readonly options?: OptionsInput } = {},
): Promise<void> {
  // A key that is there and undefined does not cross napi as an absent one.
  const options = head.options && optionDefs(head.options);
  // Awaited, so a head or a manifest the addon refuses to decode is a
  // rejection like every other failure to write, not a throw.
  await napi.writeBundle(
    path,
    { format: BUNDLE_FORMAT, ...(options ? { options } : {}) },
    manifest,
    blobs,
  );
}

/** The manifest of the bundle at `path`. */
export function readBundle(path: string): Manifest {
  return napi.readBundle(path) as Manifest;
}

/** The head of the bundle at `path`, leaving its manifest unread. */
export function readBundleHead(path: string): Head {
  return napi.readBundleHead(path) as Head;
}
