/**
 * `@opys/bundle` — the file a manifest is published as: a zip holding a
 * head, the manifest and the blobs it names. A thin wrapper over the
 * `opys-bundle` crate; the manifest itself is `@opys/core`'s.
 */

import { bundle as napi } from '@opys/binding';
import type { Manifest } from '@opys/core';

/**
 * A bundle's first entry: what the bundle says about itself, apart from the
 * installation it carries. Small and uncompressed, so it is read without the
 * manifest beside it.
 */
export interface Head {
  /** The format the bundle is written in. A reader reads exactly one. */
  readonly format: number;
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
 * error.
 */
export function writeBundle(
  path: string,
  manifest: Manifest,
  blobs: Blobs = {},
): Promise<void> {
  return napi.writeBundle(path, manifest, blobs) as Promise<void>;
}

/** The manifest of the bundle at `path`. */
export function readBundle(path: string): Manifest {
  return napi.readBundle(path) as Manifest;
}

/** The head of the bundle at `path`, leaving its manifest unread. */
export function readBundleHead(path: string): Head {
  return napi.readBundleHead(path) as Head;
}
