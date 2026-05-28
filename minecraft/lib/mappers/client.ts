import type { Artifact } from '@lanka/core';
import { sourceUrl } from '@lanka/core';
import type { Client } from '@lanka/mojang';

export function mapClientJar(client: Client): Artifact {
  return {
    path: `\${version_dir}/client.jar`,
    source: sourceUrl(client.downloads.client.url),
    size: client.downloads.client.size,
    rules: [],
    integrity: { sha1: client.downloads.client.sha1 },
  };
}
