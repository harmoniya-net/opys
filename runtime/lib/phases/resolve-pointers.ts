import { existsSync } from 'node:fs';
import {
  type Artifact,
  type Integrity,
  type Manifest,
  type PointerDescriptor,
  type Source,
  artifactApplies,
  fetchWithRetry,
  interpolate,
  isSourcePointer,
  parsePointerDescriptor,
} from '@torba/core';
import type { OsOptions } from '@torba/core';
import { NetworkError } from '../errors';
import { verifyIntegrity } from './verify';

/** Guards against a descriptor whose `source` loops back to a pointer. */
const MAX_POINTER_DEPTH = 5;

export interface PointerResolution {
  /** Manifest with every applicable `pointer` source rewritten in place. */
  manifest: Manifest;
  /**
   * `artifact.path` templates whose on-disk copy is stale (hash no longer
   * matches the descriptor, or the descriptor carries no hash). `scan`
   * must refetch these even though the file exists.
   */
  refetch: Set<string>;
  /** Count of pointer artifacts resolved — for progress reporting. */
  resolved: number;
}

async function fetchDescriptor(url: string): Promise<PointerDescriptor> {
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new NetworkError(url, res.status, body.slice(0, 200));
  }
  return parsePointerDescriptor(await res.text());
}

/** Follow a pointer (and any pointer it resolves to) to a concrete source. */
async function follow(
  source: Source,
  vars: Record<string, string>,
): Promise<{ source: Source; integrity?: Integrity; size?: number }> {
  let current = source;
  let integrity: Integrity | undefined;
  let size: number | undefined;
  for (let depth = 0; isSourcePointer(current); depth++) {
    if (depth >= MAX_POINTER_DEPTH) {
      throw new Error(
        `Pointer chain exceeded ${MAX_POINTER_DEPTH} hops at ${current.pointer}`,
      );
    }
    const descriptor = await fetchDescriptor(
      interpolate(current.pointer, vars),
    );
    current = descriptor.source;
    integrity = descriptor.integrity;
    size = descriptor.size;
  }
  return { source: current, integrity, size };
}

/**
 * Resolve every `pointer` source against its live descriptor. Runs before
 * `scan` so the rest of the pipeline only ever sees concrete sources.
 *
 * Non-applicable artifacts (filtered out by this platform's rules) keep
 * their pointer source untouched — no point fetching a descriptor for an
 * artifact `scan` will drop anyway.
 */
export async function resolvePointers(
  manifest: Manifest,
  vars: Record<string, string>,
  platform: OsOptions,
): Promise<PointerResolution> {
  const refetch = new Set<string>();
  let resolved = 0;

  const artifacts = await Promise.all(
    manifest.artifacts.map(async (artifact): Promise<Artifact> => {
      if (!isSourcePointer(artifact.source)) return artifact;
      if (!artifactApplies(artifact, platform)) return artifact;
      resolved++;

      const r = await follow(artifact.source, vars);
      const next: Artifact = {
        ...artifact,
        source: r.source,
        integrity: r.integrity ?? artifact.integrity,
        size: r.size ?? artifact.size,
      };

      // Freshness: keep an existing local copy only if it still matches the
      // descriptor's hash. No hash → the channel is mutable and unverifiable
      // by content, so always refetch to stay current.
      const finalPath = interpolate(next.path, vars);
      if (existsSync(finalPath)) {
        const fresh = next.integrity
          ? await verifyIntegrity(finalPath, next.integrity)
          : false;
        if (!fresh) refetch.add(next.path);
      }
      return next;
    }),
  );

  return { manifest: { ...manifest, artifacts }, refetch, resolved };
}
