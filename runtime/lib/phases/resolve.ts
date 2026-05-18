import type { Manifest } from '@torba/core';
import { parseManifest, TORBA_USER_AGENT } from '@torba/core';
import { readFile } from 'node:fs/promises';
import { NetworkError } from '../errors';

export type ManifestSource = Manifest | string | URL;

export async function resolveManifest(
  source: ManifestSource,
): Promise<Manifest> {
  if (typeof source === 'object' && 'artifacts' in source)
    return source as Manifest;
  if (source instanceof URL) {
    const res = await fetch(source.href, {
      headers: { 'user-agent': TORBA_USER_AGENT },
    });
    if (!res.ok) {
      throw new NetworkError(
        source.href,
        res.status,
        await res.text().catch(() => ''),
      );
    }
    return parseManifest(await res.text());
  }
  return parseManifest(await readFile(source, 'utf8'));
}
