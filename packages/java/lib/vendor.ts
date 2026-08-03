import type { Discovery } from '@opys/core';
import type { Platform } from './platforms';

/**
 * One resolved, downloadable JDK binary for a single platform. Every vendor
 * resolver (temurin/zulu/graalvm) produces this shape so `template.ts` can
 * turn it into an `Artifact` without any vendor-specific branching.
 */
export interface VendorBinary {
  readonly platform: Platform;
  readonly filename: string;
  readonly url: string;
  readonly size: number;
  /** Omitted when the vendor can't provide a checksum at resolve time — falls back to `discovery`. */
  readonly sha256?: string;
  /** Install-time checksum discovery, used when `sha256` is omitted. */
  readonly discovery?: Discovery;
}

/** A resolved JDK release — vendor-agnostic input to the shared template. */
export interface VendorRelease {
  /** Human-readable label for `ctx.log`, e.g. `Temurin 21.0.13+11`. */
  readonly label: string;
  /** Major version — buckets the runtime dir as `jdk-<major>`. */
  readonly major: number;
  readonly binaries: readonly VendorBinary[];
}

/**
 * Pick the value most items agree on (by `key`), tie-broken by the
 * lexicographically larger value. Per-platform release queries can
 * independently resolve to slightly different versions (a build just
 * published for linux but not yet for windows); anchoring on the
 * majority value and dropping the rest keeps every platform on one
 * coherent release instead of shipping a mismatched bundle.
 *
 * `items` must be non-empty — callers check that before anchoring.
 */
export function pickAnchor<T>(
  items: readonly T[],
  key: (item: T) => string,
): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].localeCompare(a[0]),
  )[0]![0];
}
