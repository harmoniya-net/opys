/**
 * `@opys/core` — the manifest contract. Behaviors are backed by the
 * Rust `opys-core` crate (via napi-rs); domain types, factories and small
 * sugar helpers are hand-written TS.
 *
 * Strategy:
 *   - Algorithms that touch the manifest contract (decode, encode, resolve,
 *     filter, interpolate, glob) → typed wrappers around the Rust binding.
 *   - Domain types → hand-typed here, matching the wire shape. These
 *     are pure data shapes; consumers construct them as plain JS objects.
 *   - Factories / type guards / small dedup helpers → pure TS, no boundary
 *     crossing. They are sugar over the typed shapes.
 *   - `parseShortRuleset` is implemented in TS as the shorthand sugar — the
 *     Rust binding accepts shorthand directly via `satisfiesRuleset` so the
 *     TS impl exists for consumers that need expanded `MojangRule` objects.
 */

import * as napi from '@opys/core-binding';
import type {
  MojangRule,
  MojangRuleset,
  OsArch,
  OsName,
  OsOptions,
  RuleAction,
} from '@opys/mojang-rules';

// `fetchWithRetry` is a build-time HTTP utility (used by Mojang/Forge/Java
// plugins). It's not part of the manifest contract, so it stays as TS —
// build-time consumers can't reach into `@opys/runtime`, so it lives here.
export { fetchWithRetry, OPYS_USER_AGENT } from './fetch';
export type { FetchRetryOptions } from './fetch';

// The Mojang rule format — types plus the two trivial factories — is owned
// by `@opys/mojang-rules`. `core` re-exports it rather than restating it,
// and extends it below with opys's own spelling (`Rule` / `Ruleset`, which
// admit the shorthand string) and the rule-tagged `Val`/`Valset`.
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
  MojangRule,
  MojangRuleset,
} from '@opys/mojang-rules';
export { emptyRuleset, allowOsRuleset } from '@opys/mojang-rules';

/**
 * One rule as written in an opys manifest: the shorthand string
 * (`'allow.os.linux'`, `'disallow.features.demo'`) or the expanded Mojang
 * object. Both are first-class — neither is a transitional form, a manifest
 * may mix them, and `parseShortRuleset` is what turns either into the
 * `MojangRule` the evaluator takes.
 */
export type Rule = string | MojangRule;

/** A ruleset as written in an opys manifest: one rule, or an array of them. */
export type Ruleset = Rule | Rule[];

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
  rules: Ruleset,
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

/** The id of the blob holding exactly `bytes`: the hex sha256 of them. */
export function blobId(bytes: Uint8Array): string {
  return napi.blobId(Buffer.from(bytes));
}

/** The id and size of the blob a file on disk would be. */
export function hashBlobFile(
  path: string,
): Promise<{ id: string; size: number }> {
  return napi.hashBlobFile(path) as Promise<{ id: string; size: number }>;
}

/**
 * Write `manifest` and the blobs it names to `path` as a bundle — the one
 * published form of a manifest. `blobs` may hold more than the manifest
 * names; a blob it names and `blobs` lacks is an error.
 */
export function writeBundle(
  path: string,
  manifest: Manifest,
  blobs: Blobs = {},
): Promise<void> {
  return napi.writeBundle(path, manifest, blobs) as Promise<void>;
}

/** The whole manifest of the bundle at `path`. */
export function readBundle(path: string): Manifest {
  return napi.readBundle(path) as Manifest;
}

/** The head of the bundle at `path`, leaving its artifact list unread. */
export function readBundleHead(path: string): Head {
  return napi.readBundleHead(path) as Head;
}

/** The bundle format this build reads and writes. */
export const BUNDLE_FORMAT: number = napi.bundleFormat();

/** Compile a glob to a real `RegExp` (the binding returns the source string). */
export function globToRegex(glob: string): RegExp {
  return new RegExp(napi.globToRegexSource(glob));
}

// ──────────────────────────────────────────────────────────────────────────
// Domain types — the wire shape.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Where an artifact's bytes come from: somewhere on the network, or a blob —
 * a file the manifest carries, named by the hex sha256 of its bytes.
 *
 * Discriminated by which field is present, not by a tag — this is the wire
 * shape, and there is no second spelling of it. Narrow with `'url' in s`.
 */
export type Source = { readonly url: string } | { readonly blob: string };

/**
 * Where a blob's bytes are on the machine that built the manifest: a file, or
 * bytes (base64) a plugin produced. This is never part of a manifest — the
 * manifest names the blob, and this says where to read it until it is written
 * into a bundle.
 */
export type BlobSource = { readonly file: string } | { readonly bytes: string };

/** Blob id → where its bytes are. */
export type Blobs = Readonly<Record<string, BlobSource>>;

export type HashEntry = { sha1: string } | { sha256: string } | { md5: string };
export type Integrity = HashEntry | HashEntry[];
export type HashAlgo = 'sha1' | 'sha256' | 'md5';

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
  readonly rules?: Ruleset;
  readonly integrity?: Integrity;
  readonly metadata?: unknown;
  readonly extract?: ExtractRule[];
}

/**
 * The object spelling of a launch argument. `value` is one string or many —
 * both are the manifest format, and the encoder collapses a rule-free single
 * value back to a bare string.
 */
export interface ValObject {
  readonly rules?: Ruleset;
  readonly value: string | string[];
}

/**
 * A launch argument as a manifest writes it: a bare string, or the rule-gated
 * object form. The bare spelling is not a shorthand on the way to the object —
 * it is what a rule-free single value encodes to, so it is what comes back out
 * of `@opys/dev` and the loaders.
 */
export type Val = string | ValObject;
export type Valset = Val[];

/** The strings a `Val` contributes, whichever spelling it arrived in. */
export function valValues(val: Val): string[] {
  if (typeof val === 'string') return [val];
  return Array.isArray(val.value) ? val.value : [val.value];
}

export interface ConditionalVal {
  readonly value: string;
  readonly rules?: Ruleset;
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

/**
 * A bundle's first entry: the manifest without its artifact list, so it can
 * be read without the megabytes that follow, and the format the bundle is
 * written in.
 */
export interface Head extends Omit<Manifest, 'artifacts'> {
  readonly format: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Factories — pure TS, no boundary crossing.
// ──────────────────────────────────────────────────────────────────────────

export const sourceUrl = (url: string): Source => ({ url });
export const sourceBlob = (blob: string): Source => ({ blob });

export const blobFile = (file: string): BlobSource => ({ file });
export const blobBytes = (bytes: Uint8Array): BlobSource => ({
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
// Shorthand expansion — pure TS sugar over canonical `MojangRule` objects.
// ──────────────────────────────────────────────────────────────────────────

function parseShortRule(raw: Rule): MojangRule {
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

export function parseShortRuleset(raw: Ruleset): MojangRuleset {
  const arr: Rule[] = Array.isArray(raw) ? raw : [raw];
  return arr.map(parseShortRule);
}
