#!/usr/bin/env node
// End-to-end smoke test for the napi bindings. Loads both .node files,
// exercises core decode/encode/resolve, then runs an actual `install` from
// runtime-napi against a tmpdir with a string source.
//
// Run from the repo root:  node scripts/smoke-napi.mjs

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../crates/torba-core-napi/index.js');
const runtime = require('../crates/torba-runtime-napi/index.js');

let ok = 0;
let fail = 0;
function check(label, predicate) {
  if (predicate) {
    console.log(`  ✓ ${label}`);
    ok++;
  } else {
    console.error(`  ✗ ${label}`);
    fail++;
  }
}

console.log('— core —');
check('currentPlatform.name is non-empty', runtime.currentPlatform().name.length > 0);
check(
  'resolveVars expands a reference',
  core.resolveVars({ a: 'hello', b: '${a} world' }).b === 'hello world',
);
check(
  'interpolate substitutes vars',
  core.interpolate('${x}-suffix', { x: 'foo' }) === 'foo-suffix',
);
check('globBase strips wildcards', core.globBase('/x/y/**/*.jar') === '/x/y');

const decoded = core.parseManifest(
  JSON.stringify({
    vars: { root: '/tmp/torba' },
    artifacts: [{ path: '${root}/a.jar', source: { url: 'https://x' } }],
  }),
);
check('parseManifest yields the artifact', decoded.artifacts.length === 1);
check('parseManifest preserves vars', decoded.vars.root === '/tmp/torba');

const filtered = core.filterManifest(
  {
    artifacts: [
      { path: 'linux.jar', source: { string: 'x' }, rules: 'allow.os.linux' },
      { path: 'any.jar', source: { string: 'x' } },
    ],
  },
  { name: 'osx', version: '', arch: 'aarch64' },
  [],
);
check(
  'filterManifest drops linux-only on osx',
  filtered.artifacts.length === 1 && filtered.artifacts[0].path === 'any.jar',
);

check(
  'satisfiesRuleset evaluates os shorthand',
  core.satisfiesRuleset(
    ['allow.os.linux'],
    { name: 'linux', version: '', arch: 'x86_64' },
    [],
  ) === true,
);

console.log('\n— runtime —');
const dir = mkdtempSync(join(tmpdir(), 'torba-napi-'));
console.log(`  tmpdir: ${dir}`);
const events = [];
await runtime.install(
  {
    vars: { root: dir },
    artifacts: [{ path: '${root}/hello.txt', source: { string: 'world' } }],
  },
  { verifyIntegrity: true },
  (event) => events.push(event.phase),
);

const written = readFileSync(join(dir, 'hello.txt'), 'utf8');
check('install writes the string source to disk', written === 'world');
check('install emits resolve event', events.includes('resolve'));
check('install emits verify event', events.includes('verify'));
check('install emits download:done event', events.includes('download:done'));

const spec = await runtime.buildLaunch({
  vars: { root: dir, jvm: '/usr/bin/java' },
  launch: { command: '${jvm}', workdir: '${root}', args: ['-version'] },
  artifacts: [],
});
check('buildLaunch interpolates command', spec.command === '/usr/bin/java');
check('buildLaunch interpolates workdir', spec.workdir === dir);
check(
  'buildLaunch passes through args',
  spec.args.length === 1 && spec.args[0] === '-version',
);

console.log(`\nresult: ${ok} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
