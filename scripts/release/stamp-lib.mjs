/**
 * One version, everywhere: the pure half of `stamp.mjs`.
 *
 * Every package and crate in the workspace is released together and carries
 * the same version. The root `package.json` says which; these functions say
 * what each other file must look like to agree with it.
 */

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

/**
 * A workspace `package.json` at `version`, with every `@opys/*` dependency
 * range moved to match. Returns a new object; key order is kept, so a file
 * already in step is rewritten byte for byte.
 */
export function stampPackage(pkg, version) {
  const out = { ...pkg, version };
  for (const field of DEP_FIELDS) {
    if (!pkg[field]) continue;
    out[field] = Object.fromEntries(
      Object.entries(pkg[field]).map(([name, range]) => [
        name,
        name.startsWith('@opys/') ? `^${version}` : range,
      ]),
    );
  }
  return out;
}

const WORKSPACE_VERSION = /^(version\s*=\s*")[^"]+(")/m;
const WORKSPACE_CRATE =
  /^(opys-[a-z0-9-]+\s*=\s*\{[^}\n]*\bversion\s*=\s*")[^"]+(")/gm;

/**
 * The root `Cargo.toml` at `version`: the `[workspace.package]` version, and
 * the version of every `opys-*` entry in `[workspace.dependencies]` — the one
 * place each internal crate's version is written.
 *
 * Text in, text out: a TOML round-trip would drop the comments.
 */
export function stampCargo(text, version) {
  // Anchored to a line start, so `rust-version = …` and the inline
  // `version = "1"` of a third-party dependency are left alone.
  if (!WORKSPACE_VERSION.test(text)) {
    throw new Error('Cargo.toml has no workspace version to stamp');
  }
  return text
    .replace(WORKSPACE_VERSION, `$1${version}$2`)
    .replace(WORKSPACE_CRATE, `$1${version}$2`);
}

/** Every version `stampCargo` would write, as it stands now. */
export function cargoVersions(text) {
  const workspace = WORKSPACE_VERSION.exec(text);
  const crates = [
    ...text.matchAll(
      /^(opys-[a-z0-9-]+)\s*=\s*\{[^}\n]*\bversion\s*=\s*"([^"]+)"/gm,
    ),
  ];
  return {
    workspace: workspace ? /"([^"]+)"/.exec(workspace[0])[1] : undefined,
    crates: Object.fromEntries(crates.map((m) => [m[1], m[2]])),
  };
}
