#!/usr/bin/env node
/**
 * Print the version this commit releases, or nothing when it releases none.
 *
 *   version=$(node scripts/release/next.mjs)
 *
 * The last release is the nearest `vX.Y.Z` tag behind `HEAD`, and the
 * commits are the ones since it. Nearest and not highest: the history
 * begins under another name with tags up to `v1.0.14`, all of them
 * ancestors of every commit here. So the checkout needs its history and its
 * tags (`fetch-depth: 0`). Needs `git` and nothing else.
 */
import { execFileSync } from 'node:child_process';
import { nextVersion } from './bump.mjs';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const last = git('describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0')
  .trim()
  .replace(/^v/, '');
// %x00 between commits: a message has newlines of its own.
const messages = git('log', `v${last}..HEAD`, '--format=%B%x00')
  .split('\0')
  .map((message) => message.trim())
  .filter(Boolean);
const next = nextVersion(last, messages);
console.error(
  next
    ? `v${last} -> v${next} (${messages.length} commits)`
    : `nothing to release since v${last} (${messages.length} commits)`,
);
if (next) console.log(next);
