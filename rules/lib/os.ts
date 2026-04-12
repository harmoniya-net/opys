import { z } from 'zod';

export type OsName = 'linux' | 'windows' | 'osx';
export type OsArch = 'x86' | 'x86_64' | 'arm' | 'aarch64' | 'any';

/** Platform context passed to rule evaluation. */
export interface OsOptions {
  name: string;
  version: string;
  arch: string;
}

/** Constraint on OS as it appears in Mojang/Unifest rule JSON. */
export type OsConstraint =
  | { name: OsName; version: string }
  | { name: OsName }
  | { arch: OsArch };

export const OsNameSchema = z.enum(['linux', 'windows', 'osx']);
export const OsArchSchema = z.enum(['x86', 'x86_64', 'arm', 'aarch64', 'any']);

export const OsConstraintSchema: z.ZodType<OsConstraint> = z.union([
  z.object({ name: OsNameSchema, version: z.string() }),
  z.object({ name: OsNameSchema }),
  z.object({ arch: OsArchSchema }),
]);

export function satisfiesOs(constraint: OsConstraint, os: OsOptions): boolean {
  if ('arch' in constraint) return constraint.arch === os.arch;
  if ('version' in constraint) {
    try {
      return (
        constraint.name === os.name &&
        new RegExp(constraint.version).test(os.version)
      );
    } catch (e) {
      throw new Error(
        `Invalid OS version pattern "${constraint.version}": ${e}`,
      );
    }
  }
  return constraint.name === os.name;
}

/** @deprecated Use {@link OsOptions} */
export type SatisfiesOsOptions = OsOptions;
