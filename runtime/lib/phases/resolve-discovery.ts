import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import {
  type Artifact,
  type Discovery,
  type HashAlgo,
  type HashEntry,
  type HashRef,
  type Manifest,
  artifactApplies,
  fetchWithRetry,
  interpolate,
  isSourceUrl,
} from '@torba/core';
import type { OsOptions } from '@torba/core';
import { NetworkError } from '../errors';
import { verifyIntegrity } from './verify';

/** Hex digest length per algorithm — used to locate a hash in free text. */
const HEX_LEN: Record<HashAlgo, number> = { sha1: 40, sha256: 64, md5: 32 };

export interface DiscoveryResolution {
  /** Manifest with every discovered `integrity` / `size` written on. */
  manifest: Manifest;
  /** `artifact.path` templates whose cached copy no longer matches. */
  refetch: Set<string>;
}

function hashEntry(algo: HashAlgo, hex: string): HashEntry {
  if (algo === 'sha1') return { sha1: hex };
  if (algo === 'sha256') return { sha256: hex };
  return { md5: hex };
}

/** The single algorithm + location named by a `HashRef`. */
function readRef(ref: HashRef): { algo: HashAlgo; at: string } {
  if ('sha256' in ref) return { algo: 'sha256', at: ref.sha256 };
  if ('sha1' in ref) return { algo: 'sha1', at: ref.sha1 };
  return { algo: 'md5', at: ref.md5 };
}

/** Basename of a URL's path — best effort, for `SHA256SUMS`-style matching. */
function urlFilename(u: string): string {
  try {
    return posix.basename(new URL(u).pathname);
  } catch {
    return posix.basename(u);
  }
}

/**
 * Pull a hash of `algo` out of an arbitrary text blob — a response header
 * value or the body of a checksum file. Tolerates `sha256sum` output and
 * RFC 9530 `algo=:base64:` headers. When `filename` is given and the blob
 * has it on a line (a `SHA256SUMS` list), only that line is searched.
 */
function extractHash(
  blob: string,
  algo: HashAlgo,
  filename?: string,
): string | undefined {
  const len = HEX_LEN[algo];
  const named = filename
    ? blob.split(/\r?\n/).filter((l) => l.includes(filename))
    : [];
  for (const text of named.length > 0 ? named : [blob]) {
    const hex = text.match(new RegExp(`\\b[0-9a-fA-F]{${len}}\\b`));
    if (hex) return hex[0].toLowerCase();
    for (const token of text.match(/[A-Za-z0-9+/_-]{20,}={0,2}/g) ?? []) {
      const buf = Buffer.from(
        token.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      );
      if (buf.length * 2 === len) return buf.toString('hex');
    }
  }
  return undefined;
}

async function discover(
  artifactUrl: string,
  spec: Discovery,
  vars: Record<string, string>,
): Promise<{ integrity?: HashEntry; size?: number }> {
  // One HEAD request feeds every `header` probe (integrity and size both).
  const needHead =
    spec.integrity?.header !== undefined || spec.size?.header !== undefined;
  let headers: Headers | undefined;
  if (needHead) {
    const res = await fetchWithRetry(artifactUrl, { method: 'HEAD' });
    if (!res.ok) throw new NetworkError(artifactUrl, res.status, '');
    headers = res.headers;
  }

  let integrity: HashEntry | undefined;
  const ip = spec.integrity;

  // Integrity: `header` probe first, `url` probe as fallback.
  if (ip?.header) {
    const { algo, at } = readRef(ip.header);
    const value = headers?.get(at);
    const hex = value ? extractHash(value, algo) : undefined;
    if (hex) integrity = hashEntry(algo, hex);
  }
  if (!integrity && ip?.url) {
    const { algo, at } = readRef(ip.url);
    const probeUrl = interpolate(at, { ...vars, url: artifactUrl });
    const res = await fetchWithRetry(probeUrl);
    if (!res.ok) throw new NetworkError(probeUrl, res.status, '');
    const hex = extractHash(await res.text(), algo, urlFilename(artifactUrl));
    if (hex) integrity = hashEntry(algo, hex);
  }
  if (ip && !integrity) {
    throw new Error(`Could not discover an integrity hash for ${artifactUrl}`);
  }

  // Size: a single `header` probe.
  let size: number | undefined;
  if (spec.size?.header) {
    const value = headers?.get(spec.size.header);
    const n = value !== null && value !== undefined ? Number(value) : NaN;
    if (Number.isFinite(n) && n >= 0) size = n;
  }

  return { integrity, size };
}

/**
 * Resolve every artifact's `discovery` block against the live upstream.
 * Runs after `resolvePointers` (so a pointer-resolved `url` source is in
 * place) and before `scan` — afterwards each artifact carries a concrete
 * `integrity` / `size`.
 *
 * A discovered hash also decides freshness: an existing local copy that no
 * longer matches is added to `refetch` so `scan` re-downloads it.
 */
export async function resolveDiscovery(
  manifest: Manifest,
  vars: Record<string, string>,
  platform: OsOptions,
): Promise<DiscoveryResolution> {
  const refetch = new Set<string>();

  const artifacts = await Promise.all(
    manifest.artifacts.map(async (artifact): Promise<Artifact> => {
      const spec = artifact.discovery;
      if (!spec) return artifact;
      if (!artifactApplies(artifact, platform)) return artifact;
      if (!isSourceUrl(artifact.source)) {
        throw new Error(
          `discovery on "${artifact.path}" requires a url source`,
        );
      }

      const artifactUrl = interpolate(artifact.source.url, vars);
      const { integrity, size } = await discover(artifactUrl, spec, vars);

      const next: Artifact = {
        ...artifact,
        integrity: integrity ?? artifact.integrity,
        size: size ?? artifact.size,
      };

      if (integrity) {
        const finalPath = interpolate(next.path, vars);
        if (existsSync(finalPath)) {
          const fresh = await verifyIntegrity(finalPath, integrity);
          if (!fresh) refetch.add(next.path);
        }
      }
      return next;
    }),
  );

  return { manifest: { ...manifest, artifacts }, refetch };
}
