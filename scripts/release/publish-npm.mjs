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
 *
 * `--provenance` is what a trusted publisher adds anyway; it is spelled out
 * for the publish that goes by token.
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

// How a publish is allowed, said up front because the registry's own answer
// to one it will not allow is a 404 for the package, which reads as a
// missing package. There are two ways. A package with a trusted publisher
// (see `trust.mjs`) needs no token: npm proves to the registry which
// workflow is running. A package that has never been published cannot have
// one yet, so its first publish needs a token, and that is all a token is
// for here.
let tokenOwner = null;
if (!dryRun) {
  try {
    tokenOwner = execFileSync('npm', ['whoami'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    console.log(`token: valid, as ${tokenOwner}`);
  } catch {
    console.log(
      'token: none that the registry accepts. Only a package with a trusted publisher can be published.',
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
      `${name}@${version} was not published. ` +
        (tokenOwner
          ? `The token of ${tokenOwner} may not publish it, and it has no trusted publisher for this workflow.`
          : 'It has no trusted publisher for this workflow (or has never been ' +
            'published, and a first publish needs a token: set NPM_TOKEN ' +
            'for this one release, then run scripts/release/trust.mjs).'),
    );
  }
}
