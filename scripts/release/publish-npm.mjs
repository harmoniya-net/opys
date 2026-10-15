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
 * Every package goes after the packages of the tree it depends on
 * (`order.mjs`), and only once those are visible where an install looks for
 * them. The registry takes minutes to show a new version to installs, and a
 * package published before that resolved, for whoever installed in between,
 * to a dependency that could not be fetched: npm then writes the lockfile
 * entry of an optional one with no version, and `npm ci` refuses the file.
 *
 * `--provenance` is what a trusted publisher adds anyway; it is spelled out
 * for the publish that goes by token.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { npmPublishOrder } from './order.mjs';

const dryRun = process.argv.includes('--dry-run');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const ADDON = 'crates/opys-napi';
const dirByName = new Map(
  [
    ...readdirSync(`${ADDON}/npm`).map((dir) => `${ADDON}/npm/${dir}`),
    ...readJson('package.json').workspaces,
  ]
    .filter((dir) => existsSync(`${dir}/package.json`))
    .map((dir) => [readJson(`${dir}/package.json`).name, dir]),
);
const order = npmPublishOrder(
  [...dirByName.values()].map((dir) => readJson(`${dir}/package.json`)),
);

/**
 * Whether an install would find this version: the abbreviated document npm
 * resolves from, not the full one `npm view` reads, since the two are cached
 * apart and the install's is the one that lags.
 */
async function visible(name, version) {
  const response = await fetch(
    `https://registry.npmjs.org/${name.replace('/', '%2f')}`,
    {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      cache: 'no-store',
    },
  );
  if (response.status === 404) return false;
  if (!response.ok)
    throw new Error(`${name}: the registry answered ${response.status}`);
  return Boolean((await response.json()).versions?.[version]);
}

/** Wait, as long as a registry reasonably takes, until an install sees it. */
async function untilVisible(name, version) {
  const deadline = Date.now() + 30 * 60_000;
  while (!(await visible(name, version))) {
    if (Date.now() > deadline)
      throw new Error(
        `${name}@${version} is published but installs still do not see it`,
      );
    console.log(`${name}@${version}: waiting for installs to see it`);
    await new Promise((done) => setTimeout(done, 15_000));
  }
}

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

for (const name of order) {
  const dir = dirByName.get(name);
  const { version } = readJson(`${dir}/package.json`);
  if (published(name, version)) {
    console.log(`${name}@${version}: already published`);
    if (!dryRun) await untilVisible(name, version);
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
  if (!dryRun) await untilVisible(name, version);
}
