#!/usr/bin/env node
// Single-command release: bump every workspace to one shared version,
// build, commit, tag, and publish. Run from the repo root.
//
//   npm run release          # patch bump  (default)
//   npm run release minor    # minor bump
//   npm run release major    # major bump
//   npm run release 2.0.0    # explicit version

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

// 2. Stamp the new version into the root and every workspace, and rewrite
//    internal @torba/* dependency ranges so the packages stay in lockstep.
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];
const stamp = (path) => {
  const pkg = readJson(path);
  pkg.version = version;
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (name.startsWith('@torba/')) pkg[field][name] = `^${version}`;
    }
  }
  writeJson(path, pkg);
};

stamp('package.json');
for (const ws of root.workspaces) stamp(`${ws}/package.json`);

// 3. Sync the lockfile, build, then commit + tag the release.
sh('npm install --package-lock-only');
sh('npm run build --workspaces --if-present');
sh('git add -A');
sh(`git commit -m "release v${version}"`);
sh(`git tag v${version}`);

// 4. Publish every public workspace.
sh('npm publish --workspaces --access public');

console.log(`\nReleased v${version}`);
