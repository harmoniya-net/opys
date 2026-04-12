import type { Unifact } from '@unifest/core';
import { exactSize, sha1Integrity, sourceUrl } from '@unifest/core';
import type { Client } from '@unifest/minecraft';

export function mapClientJar(
  client: Client,
  versionDirVar = '${version_dir}',
): Unifact {
  return {
    path: `${versionDirVar}/client.jar`,
    source: sourceUrl(client.downloads.client.url),
    size: exactSize(client.downloads.client.size),
    rules: [],
    integrity: sha1Integrity(client.downloads.client.sha1),
  };
}
