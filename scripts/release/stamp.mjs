#!/usr/bin/env node
/**
 * Bring every package and crate to the version the root `package.json`
 * carries.
 *
 *   node scripts/release/stamp.mjs           # rewrite what is out of step
 *   node scripts/release/stamp.mjs --check   # fail if anything is
 *
 * The version is chosen elsewhere: release-please reads the commits since the
 * last release, bumps the root `package.json` and opens the release PR. This
 * fans that one number out to the workspace manifests and both lockfiles, on
 * the PR's branch, so what merges is a tree that agrees with itself.
 *
 * It decides nothing and is safe to run twice: a tree already in step is
 * left exactly as it is.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampCargo, stampPackage } from './stamp-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const check = process.argv.includes('--check');
const at = (path) => join(root, path);
const readJson = (path) => JSON.parse(readFileSync(at(path), 'utf8'));

const rootPackage = readJson('package.json');
const { version } = rootPackage;
const stale = [];

/** Write `next` to `path` if it differs — or, when checking, note that it does. */
function settle(path, next) {
  if (readFileSync(at(path), 'utf8') === next) return;
  stale.push(path);
  if (!check) writeFileSync(at(path), next);
}

for (const workspace of rootPackage.workspaces) {
  const path = `${workspace}/package.json`;
  const next = stampPackage(readJson(path), version);
  settle(path, JSON.stringify(next, null, 2) + '\n');
}
settle(
  'Cargo.toml',
  stampCargo(readFileSync(at('Cargo.toml'), 'utf8'), version),
);

if (check) {
  if (stale.length > 0) {
    console.error(
      `not at ${version}:\n${stale.map((p) => `  ${p}`).join('\n')}`,
    );
    console.error('\nrun `node scripts/release/stamp.mjs`');
    process.exit(1);
  }
  console.log(`versions: ok — everything is at ${version}`);
  process.exit(0);
}

// The lockfiles record the workspace's own versions too. Neither command
// touches a third-party entry: `--package-lock-only` re-resolves nothing that
// still satisfies its range, and `--workspace` limits cargo to our crates.
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
run('npm', [
  'install',
  '--package-lock-only',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
]);
run('cargo', ['update', '--workspace']);

console.log(
  stale.length > 0
    ? `stamped ${version} into ${stale.length} file(s)`
    : `already at ${version}`,
);
