import { z } from 'zod';
import { type Ruleset, RuleSchema, OsNameSchema } from '@lanka/core';
import { type MavenCoord, MavenCoordSchema, isNativeMaven } from './maven';

export interface Artifact {
  readonly path: string;
  readonly sha1: string;
  readonly size: number;
  readonly url: string;
}

export interface Library {
  readonly name: MavenCoord;
  /** Mojang OS/feature rules — the shared `@lanka/mojang-rules` format. */
  readonly rules: Ruleset;
  readonly artifact: Artifact;
  readonly native: boolean;
}

const ArtifactSchema = z.object({
  path: z.string(),
  sha1: z.string(),
  size: z.number(),
  url: z.string(),
});

const RawLibSchema = z.object({
  downloads: z.object({
    artifact: ArtifactSchema.optional(),
    classifiers: z.record(z.string(), ArtifactSchema).default({}),
  }),
  name: MavenCoordSchema,
  rules: z.array(RuleSchema).default([]),
  natives: z.record(z.string(), z.string()).default({}),
  extract: z.object({ exclude: z.array(z.string()) }).optional(),
});

export function parseLibraries(raws: unknown[]): Library[] {
  const result: Library[] = [];
  for (const item of raws) {
    const raw = RawLibSchema.parse(item);
    if (raw.downloads.artifact) {
      result.push({
        name: raw.name,
        rules: raw.rules,
        artifact: raw.downloads.artifact,
        native: isNativeMaven(raw.name),
      });
    }
    for (const [osName, classifierKey] of Object.entries(raw.natives)) {
      // Intentional: only the legacy `ca.weblite:java-objc-bridge` classifier
      // uses the `{arch}` placeholder, and lanka targets 64-bit exclusively.
      const key = classifierKey.replace('{arch}', '64');
      const artifact = raw.downloads.classifiers[key];
      if (artifact) {
        result.push({
          name: raw.name,
          rules: [
            { action: 'allow', os: { name: OsNameSchema.parse(osName) } },
          ],
          artifact,
          native: true,
        });
      }
    }
  }
  return result;
}
