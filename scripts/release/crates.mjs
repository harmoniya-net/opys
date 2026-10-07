#!/usr/bin/env node
/**
 * Print the workspace crates in the order they are published to crates.io,
 * one per line.
 *
 *   for crate in $(node scripts/release/crates.mjs); do cargo publish -p "$crate"; done
 *
 * Needs `cargo` and nothing else — no `node_modules` — since the job that
 * publishes crates installs none.
 */
import { execFileSync } from 'node:child_process';
import { publishOrder } from './order.mjs';

const metadata = JSON.parse(
  execFileSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
);
const members = new Set(metadata.packages.map((p) => p.name));
const crates = metadata.packages.map((pkg) => ({
  name: pkg.name,
  // `publish = false` reads back as an empty registry list.
  publish: pkg.publish === null || pkg.publish.length > 0,
  deps: pkg.dependencies
    .filter((d) => members.has(d.name))
    .map((d) => ({ name: d.name, kind: d.kind ?? 'normal' })),
}));
console.log(publishOrder(crates).join('\n'));
