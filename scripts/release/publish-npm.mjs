#!/usr/bin/env node
/**
 * Publish every npm package of the tree that is not on the registry yet.
 *
 *   node scripts/release/publish-npm.mjs [--dry-run]
 *
 * The tree is already stamped and built. A package whose version is already
 * published is skipped, which is what makes a release that failed halfway
 * something to run again: a registry takes a version once, so a second
 * attempt that published everything from the start would stop at the first
 * package the first attempt got out.
 *
 * The addon's platform packages go first, then the workspaces in the order
 * `package.json` lists them, which is dependency order: nothing is on the
 * registry before what it depends on.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const dryRun = process.argv.includes('--dry-run');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const ADDON = 'crates/opys-napi';
const dirs = [
  ...readdirSync(`${ADDON}/npm`).map((dir) => `${ADDON}/npm/${dir}`),
  ...readJson('package.json').workspaces,
].filter((dir) => existsSync(`${dir}/package.json`));

/** Whether the registry already has this version of this package. */
function published(name, version) {
  try {
    const found = execFileSync(
      'npm',
      ['view', `${name}@${version}`, 'version'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return found.trim() === version;
  } catch (error) {
    // A package or a version that is not there is a 404, and is the answer.
    // Anything else is the registry failing, and not a reason to publish.
    if (String(error.stderr).includes('E404')) return false;
    throw error;
  }
}

// Asked first, because the registry answers a publish it will not allow
// with a 404 for the package, which reads as a missing package and is a
// token: one that has expired, or one that may not create a package.
if (!dryRun) {
  try {
    const who = execFileSync('npm', ['whoami'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(`publishing as ${who.trim()}`);
  } catch (error) {
    throw new Error(
      `the npm token is not accepted (expired or revoked?): ${String(error.stderr).trim().split('\n')[0]}`,
    );
  }
}

for (const dir of dirs) {
  const { name, version, private: isPrivate } = readJson(`${dir}/package.json`);
  if (isPrivate) continue;
  if (published(name, version)) {
    console.log(`${name}@${version}: already published`);
    continue;
  }
  // A platform package with no `.node` in it would install and then fail
  // to load on that platform.
  if (dir.startsWith(`${ADDON}/npm/`)) {
    const addon = readJson(`${dir}/package.json`).main;
    if (!existsSync(`${dir}/${addon}`))
      throw new Error(`${name}: ${dir}/${addon} was not built`);
  }
  console.log(`${name}@${version}: publishing`);
  try {
    execFileSync(
      'npm',
      [
        'publish',
        '--access',
        'public',
        ...(dryRun ? ['--dry-run'] : ['--provenance']),
      ],
      { cwd: dir, stdio: 'inherit' },
    );
  } catch {
    throw new Error(
      `${name}@${version} was not published. A 404 here, for a package that ` +
        'has never been published, means the token may not create packages ' +
        'in the scope.',
    );
  }
}
