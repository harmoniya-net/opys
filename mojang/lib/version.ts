import { z } from 'zod';

export class VersionFetchError extends Error {
  readonly kind = 'version-fetch' as const;
  constructor(
    readonly url: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'VersionFetchError';
  }
}

export const VERSION_MANIFEST_URL =
  'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

export const VersionSchema = z.object({
  id: z.string(),
  type: z.string(),
  url: z.string(),
  time: z.string(),
  releaseTime: z.string(),
  sha1: z.string(),
  complianceLevel: z.number(),
});

export type Version = z.infer<typeof VersionSchema>;

const VersionManifestRawSchema = z.object({
  latest: z.object({ release: z.string(), snapshot: z.string() }),
  versions: z.array(VersionSchema),
});

export interface VersionManifest {
  readonly latest: { release: string; snapshot: string };
  readonly versions: Version[];
}

export async function fetchVersionManifest(
  url = VERSION_MANIFEST_URL,
): Promise<VersionManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new VersionFetchError(
      url,
      response.status,
      `Failed to fetch version manifest: HTTP ${response.status} ${response.statusText}`,
    );
  }
  return VersionManifestRawSchema.parse(await response.json());
}

export function findVersion(
  manifest: VersionManifest,
  id: string,
): Version | undefined {
  return manifest.versions.find((v) => v.id === id);
}

export function latestRelease(manifest: VersionManifest): Version {
  const v = manifest.versions.find((v) => v.id === manifest.latest.release);
  if (!v) throw new Error('No release version found in manifest');
  return v;
}
