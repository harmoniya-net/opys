import { z } from 'zod';
import { type Ruleset, RuleSchema, OsNameSchema } from '@torba/core';
import { MavenName, MavenNameSchema } from './maven';

export interface Artifact {
  readonly path: string;
  readonly sha1: string;
  readonly size: number;
  readonly url: string;
}

export interface Library {
  readonly name: MavenName;
  /** Mojang OS/feature rules — the shared `@torba/mojang-rules` format. */
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
  name: MavenNameSchema,
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
        native: raw.name.isNative(),
      });
    }
    for (const [osName, classifierKey] of Object.entries(raw.natives)) {
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
