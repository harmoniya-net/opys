#!/usr/bin/env node
/**
 * Holds the tree to `scripts/architecture/rules.mjs`.
 *
 *   node scripts/check-architecture.mjs
 *
 * Exits non-zero and lists every violation, grouped by rule. It needs `cargo`
 * and an installed `node_modules`, and nothing built — it reads manifests and
 * sources, never an artefact.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAll } from './architecture/checks.mjs';
import * as rules from './architecture/rules.mjs';
import { readWorld } from './architecture/world.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const world = readWorld(root);
const violations = checkAll(rules, world);

if (violations.length === 0) {
  console.log(
    `architecture: ok — ${world.crates.length} crates, ${world.packages.length} packages, ${world.bindings.length} bindings`,
  );
  process.exit(0);
}

for (const rule of new Set(violations.map((v) => v.rule))) {
  console.error(`\n${rule}`);
  for (const v of violations.filter((v) => v.rule === rule))
    console.error(`  ${v.where}: ${v.message}`);
}
console.error(`\narchitecture: ${violations.length} violation(s)`);
process.exit(1);
