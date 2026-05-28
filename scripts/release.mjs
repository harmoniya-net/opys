#!/usr/bin/env node
// Single-command release: bump every workspace (npm + cargo) to one shared
// version, build, commit, tag, and publish. Run from the repo root.
//
//   npm run release          # patch bump  (default)
//   npm run release minor    # minor bump
//   npm run release major    # major bump
//   npm run release 2.0.0    # explicit version
//
// npm and crates.io versions stay in lockstep. The two -napi crates are
// `publish = false` so cargo skips them; they ship through their npm-side
// `@lanka/*-binding` packages, which carry the same version.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, data) =>
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');

function nextVersion(current, bump) {
  if (/^\d+\.\d+\.\d+([-+].+)?$/.test(bump)) return bump;
  const [major, minor, patch] = current.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`unknown bump "${bump}" — use major | minor | patch | x.y.z`);
}

// 1. Refuse to release a dirty tree — feature work must be committed first.
if (out('git status --porcelain')) {
  console.error('Working tree is dirty — commit or stash changes first.');
  process.exit(1);
}

const root = readJson('package.json');
const version = nextVersion(root.version, process.argv[2] ?? 'patch');
console.log(`Releasing ${root.version} -> ${version}\n`);

// 2a. Stamp the new version into the root and every npm workspace, and
//     rewrite internal @lanka/* dependency ranges so they stay in lockstep.
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];
const stampJson = (path) => {
  const pkg = readJson(path);
  pkg.version = version;
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (name.startsWith('@lanka/')) pkg[field][name] = `^${version}`;
    }
  }
  writeJson(path, pkg);
};

stampJson('package.json');
for (const ws of root.workspaces) stampJson(`${ws}/package.json`);

// 2b. Stamp the same version into Cargo: the workspace `[workspace.package]`
//     version (inherited by every crate via `version.workspace = true`) and
//     every internal `lanka-*` path-dep's `version = "..."` specifier.
const stampCargoWorkspace = (path) => {
  const txt = readFileSync(path, 'utf8');
  // Replace the top-level `version = "..."` line. The `^` (with /m) anchors
  // to a line start so we don't accidentally match `rust-version = ...` or
  // the inline `version = "1"` inside `[workspace.dependencies]` entries.
  const next = txt.replace(
    /^(version\s*=\s*")[^"]+(")/m,
    `$1${version}$2`,
  );
  if (next === txt) throw new Error(`could not stamp version in ${path}`);
  writeFileSync(path, next);
};
const stampCargoCrate = (path) => {
  const txt = readFileSync(path, 'utf8');
  // Rewrite `version = "..."` only on lines that also declare a lanka-* path dep.
  const next = txt.replace(
    /^(\s*lanka-[a-z-]+\s*=\s*\{[^}]*?\bversion\s*=\s*")[^"]+(".*)$/gm,
    `$1${version}$2`,
  );
  writeFileSync(path, next);
};
stampCargoWorkspace('Cargo.toml');
for (const crate of [
  'crates/lanka-core',
  'crates/lanka-runtime',
  'crates/lanka-core-napi',
  'crates/lanka-runtime-napi',
]) {
  stampCargoCrate(`${crate}/Cargo.toml`);
}

// 3. Sync both lockfiles, build to verify everything compiles, commit + tag.
sh('npm install --package-lock-only');
// `cargo build` refreshes Cargo.lock to the new workspace version and
// verifies every crate still compiles after the path-dep version bumps.
sh('cargo build --workspace --release');
sh('npm run build --workspaces --if-present');
sh('git add -A');
sh(`git commit -m "release v${version}"`);
sh(`git tag v${version}`);

// 4. Push the tag — `.github/workflows/release.yml` picks it up and runs
//    the napi cross-build matrix + publishes to npm and crates.io. The
//    secrets (NPM_TOKEN, CARGO_REGISTRY_TOKEN) live on the repo.
sh('git push --follow-tags');

console.log(`\nReleased v${version} — CI will publish from the tag.`);
