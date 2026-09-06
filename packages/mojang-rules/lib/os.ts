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
