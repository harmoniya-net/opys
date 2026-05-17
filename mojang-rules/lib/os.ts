import { z } from 'zod';

export type OsName = 'linux' | 'windows' | 'osx';
export type OsArch = 'x86' | 'x86_64' | 'arm' | 'aarch64' | 'any';

/** Platform context passed to rule evaluation. */
export interface OsOptions {
  name: string;
  version: string;
  arch: string;
}

/**
 * Constraint on OS as it appears in Mojang/Manifest rule JSON. Every field
 * is optional and independent — a present field must match, an absent one
 * is ignored. (`{ name, arch }` together is allowed, unlike the strict
 * historical shape, so no real-world rule JSON is rejected.)
 */
export interface OsConstraint {
  readonly name?: OsName;
  readonly version?: string;
  readonly arch?: OsArch;
}

export const OsNameSchema = z.enum(['linux', 'windows', 'osx']);
export const OsArchSchema = z.enum(['x86', 'x86_64', 'arm', 'aarch64', 'any']);

export const OsConstraintSchema = z.object({
  name: OsNameSchema.optional(),
  version: z.string().optional(),
  arch: OsArchSchema.optional(),
});

export function satisfiesOs(constraint: OsConstraint, os: OsOptions): boolean {
  if (constraint.name !== undefined && constraint.name !== os.name) {
    return false;
  }
  if (constraint.arch !== undefined && constraint.arch !== os.arch) {
    return false;
  }
  if (constraint.version !== undefined) {
    try {
      if (!new RegExp(constraint.version).test(os.version)) return false;
    } catch (e) {
      throw new Error(
        `Invalid OS version pattern "${constraint.version}": ${e}`,
      );
    }
  }
  return true;
}
