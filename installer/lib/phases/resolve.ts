import type { Unifest } from '@unifest/core';
import { parseUnifest } from '@unifest/core';
import { readFile } from 'node:fs/promises';

export type ManifestSource = Unifest | string | URL;

export async function resolveManifest(
  source: ManifestSource,
): Promise<Unifest> {
  if (typeof source === 'object' && 'unifacts' in source)
    return source as Unifest;
  if (
    source instanceof URL ||
    (typeof source === 'string' && /^https?:\/\//.test(source))
  ) {
    const url = source instanceof URL ? source.href : source;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return parseUnifest(await res.text());
  }
  return parseUnifest(await readFile(source as string, 'utf8'));
}
