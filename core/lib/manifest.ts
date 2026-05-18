import { z } from 'zod';
import type { OsOptions } from '@torba/mojang-rules';
import {
  type Launch,
  LaunchWireSchema,
  decodeLaunch,
  encodeLaunch,
} from './launch';
import {
  type Artifact,
  ArtifactWireSchema,
  decodeArtifact,
  encodeArtifact,
  artifactApplies,
} from './artifact';
import { type ValDefs, parseValDefs, encodeValDefs } from './valdefs';

export interface Manifest {
  readonly vars: ValDefs;
  readonly launch?: Launch;
  readonly artifacts: ReadonlyArray<Artifact>;
  /**
   * Globs (with `${var}` interpolation) describing directories whose
   * contents must come exclusively from this manifest. After install,
   * any file matching one of these globs that isn't an `artifacts[].path`
   * is deleted, and intermediate dirs left empty are pruned. Use to
   * keep `${game_directory}/mods/` etc. clean of leftovers from prior
   * installs.
   *
   * Glob syntax: `*` (one segment), `**` (any depth), `?` (one char),
   * `{a,b}` (alternation). torba's own `.torba-extracted` markers are
   * always ignored.
   */
  readonly restrict?: ReadonlyArray<string>;
}

/** Wire shape — what `torba.json` looks like before decode. */
export const ManifestWireSchema = z.object({
  vars: z.any().optional(),
  launch: LaunchWireSchema.optional(),
  artifacts: z.array(ArtifactWireSchema).optional(),
  restrict: z.array(z.string()).optional(),
});
export type ManifestWire = z.infer<typeof ManifestWireSchema>;

/** Total decode of a validated wire manifest into the domain model. */
export function decodeManifest(raw: ManifestWire): Manifest {
  return {
    vars: raw.vars != null ? parseValDefs(raw.vars) : {},
    ...(raw.launch ? { launch: decodeLaunch(raw.launch) } : {}),
    artifacts: raw.artifacts ? raw.artifacts.map(decodeArtifact) : [],
    ...(raw.restrict ? { restrict: raw.restrict } : {}),
  };
}

export function encodeManifest(u: Manifest): ManifestWire {
  return {
    vars: encodeValDefs(u.vars),
    ...(u.launch ? { launch: encodeLaunch(u.launch) } : {}),
    artifacts: u.artifacts.map(encodeArtifact),
    ...(u.restrict && u.restrict.length > 0
      ? { restrict: [...u.restrict] }
      : {}),
  };
}

export async function parseManifest(input: string): Promise<Manifest> {
  try {
    return decodeManifest(ManifestWireSchema.parse(JSON.parse(input)));
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
    ...u,
    artifacts: u.artifacts.filter((a) => artifactApplies(a, os, feats)),
  };
}
