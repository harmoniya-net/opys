import { z } from 'zod';
import type { OsOptions } from '@torba/rules';
import { type Launch, LaunchSchema, encodeLaunch } from './launch';
import {
  type Artifact,
  ArtifactSchema,
  encodeArtifact,
  artifactApplies,
} from './artifact';
import { type ValDefs, parseValDefs, encodeValDefs } from './valdefs';

export interface Manifest {
  readonly vars: ValDefs;
  readonly launch?: Launch;
  readonly artifacts: ReadonlyArray<Artifact>;
}

const ManifestRawSchema = z.object({
  vars: z.any().optional(),
  launch: LaunchSchema.optional(),
  artifacts: z.array(ArtifactSchema).optional(),
});

export const ManifestSchema: z.ZodType<Manifest> = ManifestRawSchema.transform(
  (raw): Manifest => ({
    vars: raw.vars != null ? parseValDefs(raw.vars) : {},
    launch: raw.launch,
    artifacts: raw.artifacts ?? [],
  }),
) as unknown as z.ZodType<Manifest>;

export function encodeManifest(u: Manifest): unknown {
  return {
    vars: encodeValDefs(u.vars),
    ...(u.launch ? { launch: encodeLaunch(u.launch) } : {}),
    artifacts: u.artifacts.map(encodeArtifact),
  };
}

export async function parseManifest(input: string): Promise<Manifest> {
  try {
    return ManifestSchema.parse(JSON.parse(input));
  } catch (e) {
    throw new Error(`Failed to parse manifest: ${e}`);
  }
}

export function filterManifest(
  u: Manifest,
  os: OsOptions,
  feats: string[] = [],
): Manifest {
  return {
    vars: u.vars,
    launch: u.launch,
    artifacts: u.artifacts.filter((a) => artifactApplies(a, os, feats)),
  };
}
