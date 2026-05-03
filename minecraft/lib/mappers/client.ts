import type { Artifact } from '@torba/core';
import { sourceUrl } from '@torba/core';
import type { Client } from '@torba/mojang';

export function mapClientJar(
  client: Client,
  versionDirVar = '${version_dir}',
): Artifact {
  return {
    path: `${versionDirVar}/client.jar`,
    source: sourceUrl(client.downloads.client.url),
    size: client.downloads.client.size,
    rules: [],
    integrity: { sha1: client.downloads.client.sha1 },
  };
}
