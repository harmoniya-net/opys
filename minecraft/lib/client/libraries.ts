import { z } from 'zod';
import { MavenName, MavenNameSchema } from './maven';

export interface Artifact {
  readonly path: string;
  readonly sha1: string;
  readonly size: number;
  readonly url: string;
}

/**
 * Raw Mojang rule as it appears in version JSON.
 * Structurally compatible with @unifest/rules Rule type.
 */
export type MojangRuleAction = 'allow' | 'disallow';
export type MojangRule =
  | {
      action: MojangRuleAction;
      os: { name?: string; version?: string; arch?: string };
    }
  | { action: MojangRuleAction; features: Record<string, boolean> }
  | { action: MojangRuleAction };

export interface Library {
  readonly name: MavenName;
  readonly rules: MojangRule[];
  readonly artifact: Artifact;
  readonly native: boolean;
}

const ArtifactSchema = z.object({
  path: z.string(),
  sha1: z.string(),
  size: z.number(),
  url: z.string(),
});

const MojangRuleSchema = z.union([
  z.object({
    action: z.string(),
    os: z.object({
      name: z.string().optional(),
      version: z.string().optional(),
      arch: z.string().optional(),
    }),
  }),
  z.object({ action: z.string(), features: z.record(z.string(), z.boolean()) }),
  z.object({ action: z.string() }),
]) as z.ZodType<MojangRule>;

const RawLibSchema = z.object({
  downloads: z.object({
    artifact: ArtifactSchema.optional(),
    classifiers: z.record(z.string(), ArtifactSchema).default({}),
  }),
  name: MavenNameSchema,
  rules: z.array(MojangRuleSchema).default([]),
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
          rules: [{ action: 'allow', os: { name: osName } }],
          artifact,
          native: true,
        });
      }
    }
  }
  return result;
}
