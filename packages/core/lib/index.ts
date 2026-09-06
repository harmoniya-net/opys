/**
 * `@opys/core` — the frozen-manifest contract. Behaviors are backed by the
 * Rust `opys-core` crate (via napi-rs); domain types, factories and small
 * sugar helpers are hand-written TS.
 *
 * Strategy:
 *   - Algorithms that touch the manifest contract (decode, encode, resolve,
 *     filter, interpolate, glob) → typed wrappers around the Rust binding.
 *   - Domain types → hand-typed here, matching the frozen wire shape. These
 *     are pure data shapes; consumers construct them as plain JS objects.
 *   - Factories / type guards / small dedup helpers → pure TS, no boundary
 *     crossing. They are sugar over the typed shapes.
 *   - `parseShortRuleset` is implemented in TS as the shorthand sugar — the
 *     Rust binding accepts shorthand directly via `satisfiesRuleset` so the
 *     TS impl exists for consumers that need expanded `Rule` objects.
 */

import * as napi from '@opys/core-binding';
import type {
  OsArch,
  OsName,
  OsOptions,
  Rule,
  RuleAction,
  Ruleset,
} from '@opys/mojang-rules';

// `fetchWithRetry` is a build-time HTTP utility (used by Mojang/Forge/Java
// plugins). It's not part of the manifest contract, so it stays as TS —
// build-time consumers can't reach into `@opys/runtime`, so it lives here.
export { fetchWithRetry, OPYS_USER_AGENT } from './fetch';
export type { FetchRetryOptions } from './fetch';

// The Mojang rule format — types plus the two trivial factories — is owned
// by `@opys/mojang-rules`. `core` re-exports it rather than restating it,
// and extends it below with the opys shorthand codec (`parseShortRuleset` /
// `encodeShortRuleset`) and the rule-tagged `Val`/`Valset`.
//
// The evaluator is deliberately *not* re-exported: `satisfiesRuleset` here
// expands shorthand first, so it is strictly wider than the Mojang-standard
// predicate. The strict one lives in `@opys/mojang`.
export type {
  OsName,
  OsArch,
  OsOptions,
  OsConstraint,
  FeatureConstraint,
  RuleAction,
  Rule,
  Ruleset,
} from '@opys/mojang-rules';
export { emptyRuleset, allowOsRuleset } from '@opys/mojang-rules';

// ──────────────────────────────────────────────────────────────────────────
// Behaviors — typed wrappers around the Rust binding.
//
// The codegen'd `.d.ts` types every return value as `Json` (≈ unknown), so
// each wrapper carries one `as`-cast at the boundary. No `as unknown as`.
// ──────────────────────────────────────────────────────────────────────────

export function decodeManifest(wire: unknown): Manifest {
  return napi.decodeManifest(wire) as Manifest;
}
export function encodeManifest(domain: Manifest): unknown {
  return napi.encodeManifest(domain);
}
export function parseManifest(input: string): Manifest {
  return napi.parseManifest(input) as Manifest;
}
export function filterManifest(
  manifest: Manifest,
  platform: OsOptions,
  features: string[] = [],
): Manifest {
  return napi.filterManifest(manifest, platform, features) as Manifest;
}
export function resolveVars(
  vars: Record<string, string>,
): Record<string, string> {
  return napi.resolveVars(vars);
}
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return napi.interpolate(template, vars);
}
export function resolvedArgs(
  launch: Launch,
  platform: OsOptions,
  features: string[] = [],
): string[] {
  return napi.resolvedArgs(launch, platform, features);
}
export function resolvedEnvs(
  launch: Launch,
  platform: OsOptions,
  features: string[] = [],
): Record<string, string> {
  return napi.resolvedEnvs(launch, platform, features);
}
export function satisfiesRuleset(
  rules: Ruleset | string | unknown,
  platform: OsOptions,
  features: string[] = [],
): boolean {
  return napi.satisfiesRuleset(rules, platform, features);
}
export function globBase(glob: string): string {
  return napi.globBase(glob);
}
export function globToRegexSource(glob: string): string {
  return napi.globToRegexSource(glob);
}

/** Compile a glob to a real `RegExp` (the binding returns the source string). */
export function globToRegex(glob: string): RegExp {
  return new RegExp(napi.globToRegexSource(glob));
}

// ──────────────────────────────────────────────────────────────────────────
// Domain types — frozen wire shape.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Discriminated by which field is present, not by a tag — this is the frozen
 * wire shape, and there is no second spelling of it. Narrow with `'url' in s`.
 */
export type Source =
  | { readonly url: string }
  | { readonly file: string }
  | { readonly string: string }
  | { readonly bytes: string }
  | { readonly pointer: string };

export type HashEntry = { sha1: string } | { sha256: string } | { md5: string };
export type Integrity = HashEntry | HashEntry[];
export type HashAlgo = 'sha1' | 'sha256' | 'md5';

export type HashRef =
  | { readonly sha256: string }
  | { readonly sha1: string }
  | { readonly md5: string };

export interface IntegrityProbes {
  readonly header?: HashRef;
  readonly url?: HashRef;
}
export interface SizeProbes {
  readonly header?: string;
}
export interface Discovery {
  readonly integrity?: IntegrityProbes;
  readonly size?: SizeProbes;
}

/**
 * Like `Source`, the extract rules are discriminated by which field is
 * present: `file` → pick, `matches` → scan, otherwise dump.
 */
export interface ExtractPick {
  readonly file: string;
  readonly into: string;
}
export interface ExtractScan {
  readonly matches: string;
  readonly into: string;
  /**
   * Path-prefixes to strip off each matched entry, tried in order. A
   * literal string is a plain prefix; `*<suffix>` strips up through the
   * first occurrence of `<suffix>` regardless of what precedes it — e.g. a
   * wildcard followed by a single slash drops an archive's top-level
   * directory whatever it's named, for archives whose internal directory
   * embeds a build identifier unknowable ahead of time.
   */
  readonly strip?: string[];
  readonly includes?: string[];
  readonly excludes?: string[];
}
export interface ExtractDump {
  readonly into: string;
  readonly clean?: boolean;
  readonly includes?: string[];
  readonly excludes?: string[];
}
export type ExtractRule = ExtractPick | ExtractScan | ExtractDump;

export interface Artifact {
  readonly path: string;
  readonly source: Source;
  readonly size?: number;
  readonly rules: Ruleset;
  readonly integrity?: Integrity;
  readonly discovery?: Discovery;
  readonly metadata?: unknown;
  readonly extract?: ExtractRule[];
}

export interface Val {
  readonly rules: Ruleset;
  readonly value: string[];
}
export type Valset = Val[];

export interface ConditionalVal {
  readonly value: string;
  readonly rules: Ruleset;
}
export type ValDefs = Readonly<
  Record<string, string | readonly ConditionalVal[]>
>;

export interface Launch {
  readonly command: string;
  readonly workdir: string;
  readonly args: Valset;
  readonly envs: ValDefs;
}

export interface Manifest {
  readonly vars: ValDefs;
  readonly launch?: Launch;
  readonly artifacts: ReadonlyArray<Artifact>;
  readonly restrict?: ReadonlyArray<string>;
}

export interface PointerDescriptor {
  readonly source: Source;
  readonly integrity?: Integrity;
  readonly size?: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Factories — pure TS, no boundary crossing.
// ──────────────────────────────────────────────────────────────────────────

export const sourceUrl = (url: string): Source => ({ url });
export const sourceFile = (file: string): Source => ({ file });
export const sourceString = (string: string): Source => ({ string });
export const sourcePointer = (pointer: string): Source => ({ pointer });
export const sourceBytes = (bytes: Uint8Array): Source => ({
  bytes: Buffer.from(bytes).toString('base64'),
});

export const extractPick = (file: string, into: string): ExtractPick => ({
  file,
  into,
});
export const extractScan = (
  matches: string,
  into: string,
  opts?: Omit<ExtractScan, 'matches' | 'into'>,
): ExtractScan => ({ matches, into, ...opts });
export const extractDump = (
  into: string,
  opts?: Omit<ExtractDump, 'into'>,
): ExtractDump => ({ into, ...opts });

/** Deduplicate by normalized (posix) path; later entries win. */
export function deduplicateArtifacts(artifacts: Artifact[]): Artifact[] {
  const norm = (p: string): string => {
    const parts = p.split('/');
    const stack: string[] = [];
    const lead = p.startsWith('/');
    for (const seg of parts) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') {
        if (stack.length > 0 && stack[stack.length - 1] !== '..') stack.pop();
        else if (!lead) stack.push('..');
      } else stack.push(seg);
    }
    const joined = stack.join('/');
    if (lead) return '/' + joined;
    return joined === '' ? '.' : joined;
  };
  const map = new Map<string, Artifact>();
  for (const u of artifacts) map.set(norm(u.path), u);
  return [...map.values()];
}

// ──────────────────────────────────────────────────────────────────────────
// Shorthand expansion — pure TS sugar over canonical `Rule` objects.
// ──────────────────────────────────────────────────────────────────────────

type RawSingle = string | Rule;
type RawRuleset = RawSingle | RawSingle[];

function parseShortRule(raw: RawSingle): Rule {
  if (typeof raw !== 'string') return raw;
  const parts = raw.split('.');
  const action = parts[0] as RuleAction;
  if (action !== 'allow' && action !== 'disallow') {
    throw new Error(`Unknown action '${action}'`);
  }
  const type = parts[1];
  if (!type) return { action };
  const rest = parts.slice(2).join('.');
  switch (type) {
    case 'os': {
      if (!rest) throw new Error('missing OS name');
      const atIdx = rest.indexOf('@');
      const name = (atIdx === -1 ? rest : rest.slice(0, atIdx)) as OsName;
      if (!['linux', 'windows', 'osx'].includes(name))
        throw new Error(`invalid os name '${name}'`);
      const version = atIdx === -1 ? undefined : rest.slice(atIdx + 1);
      return version
        ? { action, os: { name, version } }
        : { action, os: { name } };
    }
    case 'features': {
      if (!rest) throw new Error('missing feature name');
      return { action, features: { [rest]: true } };
    }
    case 'arch': {
      if (!rest) throw new Error('missing arch');
      const arch = rest as OsArch;
      if (!['x86', 'x86_64', 'arm', 'aarch64', 'any'].includes(arch))
        throw new Error(`invalid arch '${arch}'`);
      return { action, os: { arch } };
    }
    default:
      throw new Error(`unknown rule type '${type}'`);
  }
}

export function parseShortRuleset(raw: RawRuleset): Ruleset {
  const arr: RawSingle[] = Array.isArray(raw) ? raw : [raw];
  return arr.map(parseShortRule);
}

// ──────────────────────────────────────────────────────────────────────────
// `parseValset` — used by the Mojang version-JSON mapper. Build-time-only;
// not part of the napi boundary surface.
// ──────────────────────────────────────────────────────────────────────────

export function parseValset(raw: unknown): Valset {
  if (!Array.isArray(raw)) {
    throw new Error('parseValset: expected an array');
  }
  return raw.map((entry): Val => {
    if (typeof entry === 'string') return { rules: [], value: [entry] };
    if (entry && typeof entry === 'object') {
      const obj = entry as { rules?: unknown; value: string | string[] };
      const rules = obj.rules ? parseShortRuleset(obj.rules as RawRuleset) : [];
      const value = Array.isArray(obj.value) ? obj.value : [obj.value];
      return { rules, value };
    }
    throw new Error('parseValset: invalid entry');
  });
}
