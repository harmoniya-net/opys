#!/usr/bin/env node
/**
 * Write one version into every package and crate of the tree.
 *
 *   node scripts/release/stamp.mjs 0.3.0
 *
 * A release does this in its own checkout and commits nothing: the version
 * of a release is its tag, and the number in the tree is only whatever was
 * there when the tree was last stamped by hand. Committing it back would
 * put a commit of the pipeline's on `main` after every push.
 *
 * npm and crates.io stay in lockstep. What is stamped is found, not listed:
 * the npm workspaces, the addon's platform packages under `npm/`, and every
 * directory of `crates/` with a `Cargo.toml`. Needs `node` and nothing else.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: node scripts/release/stamp.mjs <x.y.z>');
  process.exit(1);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, data) =>
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');

// The version itself, and every `@opys/*` range, so a package asks for the
// release it was published with.
const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const stampJson = (path, also = (pkg) => pkg) => {
  const pkg = readJson(path);
  pkg.version = version;
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (name.startsWith('@opys/')) pkg[field][name] = `^${version}`;
    }
  }
  writeJson(path, also(pkg));
};

const root = readJson('package.json');
stampJson('package.json');

// The addon is one package that loads one of several: a package per
// platform, each holding that platform's `.node`. The loader names them as
// optional dependencies, pinned exactly, so npm installs the one that
// matches the machine. They are not in the tree because they are not
// workspaces, and are written here for the same reason.
const ADDON = 'crates/opys-napi';
const platforms = readdirSync(`${ADDON}/npm`)
  .map((dir) => `${ADDON}/npm/${dir}/package.json`)
  .filter(existsSync);
for (const path of platforms) stampJson(path);

for (const workspace of root.workspaces) {
  stampJson(`${workspace}/package.json`, (pkg) =>
    workspace === ADDON
      ? {
          ...pkg,
          optionalDependencies: Object.fromEntries(
            platforms.map((path) => [readJson(path).name, version]),
          ),
        }
      : pkg,
  );
}

// Cargo: the workspace version, which every crate inherits, and the version
// beside each internal path dependency.
const replaceIn = (path, pattern, replacement, required) => {
  const text = readFileSync(path, 'utf8');
  const next = text.replace(pattern, replacement);
  if (required && next === text)
    throw new Error(`could not stamp the version in ${path}`);
  writeFileSync(path, next);
};
// `^` with /m anchors to a line start, so neither `rust-version = ...` nor
// the `version = "1"` of an outside dependency matches.
replaceIn('Cargo.toml', /^(version\s*=\s*")[^"]+(")/m, `$1${version}$2`, true);
// Only on a line that declares an `opys-*` dependency: in the workspace's
// own table, which the crates inherit from, and in any crate that still
// spells one out. A manifest with none has nothing to rewrite.
const INTERNAL =
  /^(\s*opys-[a-z0-9-]+\s*=\s*\{[^}]*?\bversion\s*=\s*")[^"]+(".*)$/gm;
const manifests = [
  'Cargo.toml',
  ...readdirSync('crates').map((crate) => `crates/${crate}/Cargo.toml`),
].filter(existsSync);
for (const manifest of manifests)
  replaceIn(manifest, INTERNAL, `$1${version}$2`, false);

console.log(`stamped ${version}`);
