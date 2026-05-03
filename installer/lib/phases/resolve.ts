import type { Manifest } from '@torba/core';
import { parseManifest } from '@torba/core';
import { readFile } from 'node:fs/promises';

export type ManifestSource = Manifest | string | URL;

export async function resolveManifest(
  source: ManifestSource,
): Promise<Manifest> {
  if (typeof source === 'object' && 'artifacts' in source)
    return source as Manifest;
  if (source instanceof URL) {
    const res = await fetch(source.href);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${source.href}`);
    return parseManifest(await res.text());
  }
  return parseManifest(await readFile(source, 'utf8'));
}
