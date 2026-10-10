#!/usr/bin/env node
/**
 * Make CI the trusted publisher of every npm package of the tree.
 *
 *   npm login                          # your own account, with 2FA
 *   node scripts/release/trust.mjs     # --dry-run to see what it would do
 *
 * A trusted publisher is npm's name for publishing with no secret: the
 * registry is told once which repository and which workflow may publish a
 * package, and from then on that workflow proves who it is (OIDC) and no
 * token is stored anywhere. A token expires, and the release found that out
 * by failing.
 *
 * It is set per package, by a maintainer, and only for a package that
 * already exists. So this is run by hand: once now, and again after a
 * release that published a package for the first time. A package that has
 * one already is left alone, and one not on the registry yet is listed at
 * the end.
 *
 * The workflow named is `ci.yml`, not `release.yml`: the release is called
 * from CI, and the registry checks the workflow that was triggered, not the
 * one that holds the publish step. Needs npm 11.15 or newer.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const REPO = 'harmoniya-net/opys';
const WORKFLOW = 'ci.yml';
const dryRun = process.argv.includes('--dry-run');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const [major, minor] = execFileSync('npm', ['--version'], { encoding: 'utf8' })
  .trim()
  .split('.')
  .map(Number);
if (major < 11 || (major === 11 && minor < 15)) {
  console.error('npm 11.15 or newer is needed: npm install -g npm@latest');
  process.exit(1);
}

const ADDON = 'crates/opys-napi';
const names = [
  ...readdirSync(`${ADDON}/npm`).map((dir) => `${ADDON}/npm/${dir}`),
  ...readJson('package.json').workspaces,
]
  .filter((dir) => existsSync(`${dir}/package.json`))
  .map((dir) => readJson(`${dir}/package.json`))
  .filter((pkg) => !pkg.private)
  .map((pkg) => pkg.name);

const quiet = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
const exists = (name) => {
  try {
    execFileSync('npm', ['view', name, 'name'], quiet);
    return true;
  } catch {
    return false;
  }
};
/** Whether the package already trusts this workflow of this repository. */
const trusted = (name) => {
  try {
    const listed = execFileSync(
      'npm',
      ['trust', 'list', name, '--json'],
      quiet,
    );
    return listed.includes(REPO) && listed.includes(WORKFLOW);
  } catch {
    // Nothing listed is not an error worth stopping for: the next command
    // says what is wrong, if anything is.
    return false;
  }
};

const unpublished = [];
for (const name of names) {
  if (!exists(name)) {
    unpublished.push(name);
    continue;
  }
  if (trusted(name)) {
    console.log(`${name}: already trusts ${REPO} ${WORKFLOW}`);
    continue;
  }
  console.log(`${name}: trusting ${REPO} ${WORKFLOW}`);
  execFileSync(
    'npm',
    [
      'trust',
      'github',
      name,
      '--file',
      WORKFLOW,
      '--repo',
      REPO,
      '--allow-publish',
      '--yes',
      ...(dryRun ? ['--dry-run'] : []),
    ],
    // Inherited: the registry asks for a second factor here.
    { stdio: 'inherit' },
  );
}

if (unpublished.length) {
  console.log(
    `\nNot on the registry yet, so nothing to trust: ${unpublished.join(', ')}.\n` +
      'Their first publish needs a token (the NPM_TOKEN secret, for that one\n' +
      'release). Run this again afterwards and delete the secret.',
  );
}
