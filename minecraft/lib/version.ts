import { z } from 'zod';

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

export const VersionManifestSchema = z.object({
  latest: z.object({
    release: z.string(),
    snapshot: z.string(),
  }),
  versions: z.array(VersionSchema),
});

export class VersionManifest {
  constructor(
    private readonly manifest: z.infer<typeof VersionManifestSchema>,
  ) {}

  public static async fetch(
    url = VERSION_MANIFEST_URL,
  ): Promise<VersionManifest> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.statusText}`);
    }
    return new VersionManifest(
      VersionManifestSchema.parse(await response.json()),
    );
  }

  public latest(): Version {
    const version = this.manifest.versions.find(
      (v) => v.id === this.manifest.latest.release,
    );
    if (!version)
      throw new Error('No release version found. Manifest is invalid.');
    return version;
  }

  public snapshot(): Version {
    const version = this.manifest.versions.find(
      (v) => v.id === this.manifest.latest.snapshot,
    );
    if (!version)
      throw new Error('No snapshot version found. Manifest is invalid.');
    return version;
  }

  public oldest(): Version {
    const version = this.manifest.versions.at(-1);
    if (!version) throw new Error('No versions found. Manifest is invalid.');
    return version;
  }

  public search(id: string): Version | undefined {
    return this.manifest.versions.find((v) => v.id === id);
  }
}
