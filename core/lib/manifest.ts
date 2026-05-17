import { z } from 'zod';
import type { OsOptions } from '@torba/mojang-rules';
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
  /**
   * Globs (with `${var}` interpolation) describing directories whose
   * contents must come exclusively from this manifest. After install,
   * any file matching one of these globs that isn't an `artifacts[].path`
   * is deleted, and intermediate dirs left empty are pruned. Use to
   * keep `${game_directory}/mods/` etc. clean of leftovers from prior
   * installs.
   *
   * Glob syntax: `*` (one segment), `**` (any depth), `?` (one char),
   * `{a,b}` (alternation). torba's own bookkeeping files
   * (`.torba-extracted` markers, `.cache/` archive caches) are always
   * ignored.
   */
  readonly restrict?: ReadonlyArray<string>;
}

const ManifestRawSchema = z.object({
  vars: z.any().optional(),
  launch: LaunchSchema.optional(),
  artifacts: z.array(ArtifactSchema).optional(),
  restrict: z.array(z.string()).optional(),
});

export const ManifestSchema: z.ZodType<Manifest> = ManifestRawSchema.transform(
  (raw): Manifest => ({
    vars: raw.vars != null ? parseValDefs(raw.vars) : {},
    launch: raw.launch,
    artifacts: raw.artifacts ?? [],
    ...(raw.restrict ? { restrict: raw.restrict } : {}),
  }),
) as unknown as z.ZodType<Manifest>;

export function encodeManifest(u: Manifest): unknown {
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

/**
 * Catch a class of config typos at manifest-construction time rather than
 * deep inside `resolveValset`. We've seen real configs hit this when a
 * helper's API changed (e.g. `fr.launch.mainClass` vs `fr.mainClass`) and
 * the typo silently wedges `undefined` into an args array. The downstream
 * stack trace is "Cannot read properties of undefined (reading 'rules')"
 * inside the rules engine, which is not useful for the user.
 *
 * Throws an `Error` with a path-prefixed message pointing at the offending
 * field. Returns the manifest unchanged on success so callers can chain.
 */
export function validateManifest(manifest: Manifest): Manifest {
  const launch = manifest.launch;
  if (launch) {
    if (typeof launch.command !== 'string') {
      throw new Error(
        `manifest.launch.command is ${launch.command}; expected string ` +
          `(e.g. \`fr.launch.command\` or \`'\${java_bin}'\`).`,
      );
    }
    if (typeof launch.workdir !== 'string') {
      throw new Error(
        `manifest.launch.workdir is ${launch.workdir}; expected string.`,
      );
    }
    if (!Array.isArray(launch.args)) {
      throw new Error(
        `manifest.launch.args is ${typeof launch.args}; expected array. ` +
          `If you're hand-building \`launch\`, remember it needs ` +
          `\`{ command, workdir, args, envs }\` — easiest is to spread ` +
          `\`...fr.launch\` then override what you need.`,
      );
    }
    launch.args.forEach((arg, i) => {
      if (arg == null) {
        throw new Error(
          `manifest.launch.args[${i}] is ${arg} — check your config for ` +
            `a typo or undefined reference (e.g. \`fr.launch.mainClass\` ` +
            `should be \`fr.mainClass\`).`,
        );
      }
      if (typeof arg !== 'object' || !Array.isArray(arg.value)) {
        throw new Error(
          `manifest.launch.args[${i}] is not a Val ({ rules, value: string[] }); got ${JSON.stringify(arg)}`,
        );
      }
    });
    if (launch.envs == null || typeof launch.envs !== 'object') {
      throw new Error(
        `manifest.launch.envs is ${launch.envs}; expected an object ` +
          `(use \`{}\` for none, or spread \`fr.launch.envs\` to keep ` +
          `loader-set envs).`,
      );
    }
    for (const [key, val] of Object.entries(launch.envs)) {
      if (val == null) {
        throw new Error(
          `manifest.launch.envs[${JSON.stringify(key)}] is ${val} — check your config.`,
        );
      }
      if (Array.isArray(val)) {
        val.forEach((arm, i) => {
          if (arm == null) {
            throw new Error(
              `manifest.launch.envs[${JSON.stringify(key)}][${i}] is ${arm} — check your config.`,
            );
          }
        });
      }
    }
  }
  for (const [key, val] of Object.entries(manifest.vars)) {
    if (val == null) {
      throw new Error(
        `manifest.vars[${JSON.stringify(key)}] is ${val} — check your config.`,
      );
    }
    if (Array.isArray(val)) {
      val.forEach((arm, i) => {
        if (arm == null) {
          throw new Error(
            `manifest.vars[${JSON.stringify(key)}][${i}] is ${arm} — check your config.`,
          );
        }
      });
    }
  }
  manifest.artifacts.forEach((a, i) => {
    if (a == null) {
      throw new Error(
        `manifest.artifacts[${i}] is ${a} — one of your artifact iterables ` +
          `yielded a falsy value.`,
      );
    }
  });
  if (manifest.restrict) {
    manifest.restrict.forEach((g, i) => {
      if (typeof g !== 'string' || g.length === 0) {
        throw new Error(
          `manifest.restrict[${i}] is ${JSON.stringify(g)}; expected a non-empty glob string.`,
        );
      }
    });
  }
  return manifest;
}
