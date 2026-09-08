#!/usr/bin/env node
// End-to-end smoke test for the napi bindings. Loads all six .node files,
// exercises core decode/encode/resolve, the mojang parsers, the dev engine's
// merge, a java resolve against a loopback stand-in for the Adoptium API and
// a vanilla Minecraft resolve against one for the Mojang endpoints, then runs
// an actual `install` from runtime-napi against a tmpdir with a string
// source.
//
// Run from the repo root:  node scripts/smoke-napi.mjs

import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../crates/opys-core-napi/index.js');
const runtime = require('../crates/opys-runtime-napi/index.js');
const mojang = require('../crates/opys-mojang-napi/index.js');
const dev = require('../crates/opys-dev-napi/index.js');
const java = require('../crates/opys-java-napi/index.js');
const minecraft = require('../crates/opys-minecraft-napi/index.js');

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
check(
  'currentPlatform.name is non-empty',
  runtime.currentPlatform().name.length > 0,
);
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
    vars: { root: '/tmp/opys' },
    artifacts: [{ path: '${root}/a.jar', source: { url: 'https://x' } }],
  }),
);
check('parseManifest yields the artifact', decoded.artifacts.length === 1);
check('parseManifest preserves vars', decoded.vars.root === '/tmp/opys');

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

console.log('\n— mojang —');
check(
  'parseMaven splits a coordinate',
  mojang.parseMaven('org.lwjgl:lwjgl:3.3.1:natives-linux').classifier ===
    'natives-linux',
);
check(
  'encodeMaven inverts parseMaven',
  mojang.encodeMaven(mojang.parseMaven('org.lwjgl:lwjgl:3.3.1')) ===
    'org.lwjgl:lwjgl:3.3.1',
);
check(
  'parseArguments reads the legacy string form',
  mojang.parseArguments('--demo --width 100').legacy === true,
);
check(
  'assetPath shards on the hash prefix',
  mojang.assetPath('abcdef') === 'ab/abcdef',
);
// The mojang addon is strict Mojang format — shorthand belongs to core.
check(
  'satisfiesRuleset accepts the expanded form',
  mojang.satisfiesRuleset(
    [{ action: 'allow', os: { name: 'linux' } }],
    { name: 'linux', version: '', arch: 'x86_64' },
    [],
  ) === true,
);
let rejectedShorthand = false;
try {
  mojang.decodeRuleset(['allow.os.linux']);
} catch {
  rejectedShorthand = true;
}
check('decodeRuleset rejects opys shorthand', rejectedShorthand);

console.log('\n— runtime —');
const dir = mkdtempSync(join(tmpdir(), 'opys-napi-'));
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

console.log('\n— dev —');
const assembled = dev.assemble(
  [
    {
      name: 'base',
      contribution: {
        artifacts: [{ path: 'a.jar', source: { url: 'https://x/a' } }],
        vars: { root: '.' },
      },
    },
    {
      name: 'other',
      contribution: {
        artifacts: [{ path: 'a.jar', source: { url: 'https://x/b' } }],
        vars: { root: 'clash' },
        envs: { E: '1' },
      },
    },
  ],
  {
    command: 'java',
    args: [[{ rules: [], value: ['-Xmx2G'] }], 'Main'],
    restrict: ['mods/**'],
  },
);
check(
  'assemble dedupes by path, last content wins',
  assembled.manifest.artifacts.length === 1 &&
    assembled.manifest.artifacts[0].source.url === 'https://x/b',
);
check(
  'assemble warns on a plugin-vs-plugin var collision',
  assembled.warnings.some((w) => w.includes("var 'root'")),
);
check(
  'assemble flattens launch fragments in author order',
  JSON.stringify(assembled.manifest.launch.args) ===
    JSON.stringify(['-Xmx2G', 'Main']),
);
check(
  'assemble defaults workdir to "."',
  assembled.manifest.launch.workdir === '.',
);
check(
  'assemble merges plugin envs and emits restrict',
  assembled.manifest.launch.envs.E === '1' &&
    JSON.stringify(assembled.manifest.restrict) === JSON.stringify(['mods/**']),
);

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

console.log('\n— java —');
check(
  'defaultPlatforms covers six (os, arch) pairs',
  java.defaultPlatforms().length === 6,
);

// The resolvers do real HTTP, so stand in for Adoptium on loopback — that
// keeps the smoke test hermetic while still crossing the whole boundary.
const adoptium = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' }).end(
    JSON.stringify([
      {
        release_name: 'jdk-21.0.11+10',
        version_data: { major: 21 },
        binaries: [
          {
            architecture: 'x64',
            os: 'linux',
            image_type: 'jdk',
            jvm_impl: 'hotspot',
            package: {
              checksum: 'abc123',
              link: 'https://example.invalid/a.tar.gz',
              name: 'a.tar.gz',
              size: 12345,
            },
          },
        ],
      },
    ]),
  );
});
await new Promise((resolve) => adoptium.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${adoptium.address().port}`;
const javaOpts = {
  version: '21',
  platforms: [{ os: 'linux', arch: 'x86_64' }],
  apiBase,
};

const template = await java.resolveJava(javaOpts);
check(
  'resolveJava labels the resolved release',
  template.release.label === 'Temurin 21.0.11+10',
);
check(
  'resolveJava emits one artifact per binary',
  template.artifacts.length === 1 &&
    template.artifacts[0].source.url === 'https://example.invalid/a.tar.gz',
);
check(
  'resolveJava owns java_home / java_bin / java_runtime_dir',
  ['java_home', 'java_bin', 'java_runtime_dir'].every(
    (k) => k in template.vars,
  ),
);

const built = await java.buildJava(javaOpts);
check('buildJava names the plugin', built.output.name === 'java');
check(
  'buildJava exposes the bin launch group and JAVA_HOME',
  built.output.contribution.launch.bin === '${java_bin}' &&
    built.output.contribution.envs.JAVA_HOME === '${java_home}',
);

// The java contribution folds through the same engine the config uses.
const withJava = dev.assemble([built.output], {
  command: '${java_bin}',
  args: ['-version'],
});
check(
  'assemble accepts the java contribution end to end',
  withJava.manifest.artifacts.length === 1 &&
    withJava.manifest.vars.java_runtime_dir === '${root}/runtimes',
);

adoptium.close();

// ── minecraft ─────────────────────────────────────────────────────────────
console.log('— minecraft —');

const CLIENT_JSON = (id, base) => ({
  id,
  type: 'release',
  time: '2023-06-12T00:00:00+00:00',
  releaseTime: '2023-06-12T00:00:00+00:00',
  minimumLauncherVersion: 21,
  assets: '5',
  complianceLevel: 1,
  mainClass: 'net.minecraft.client.main.Main',
  assetIndex: {
    id: '5',
    sha1: 'c'.repeat(40),
    size: 1,
    totalSize: 2,
    url: `${base}/assets/5.json`,
  },
  downloads: {
    client: {
      sha1: 'd'.repeat(40),
      size: 3,
      url: 'https://example.invalid/c.jar',
    },
  },
  libraries: [],
  arguments: { game: ['--demo'], jvm: ['-Xmx2G'] },
});

let mojangBase = '';
const mojangApi = createServer((req, res) => {
  const target = req.url ?? '';
  const body = target.startsWith('/versions/')
    ? CLIENT_JSON('1.20.1', mojangBase)
    : target.startsWith('/assets/')
      ? { objects: { 'pack.mcmeta': { hash: '0f00', size: 2 } } }
      : {
          latest: { release: '1.20.1', snapshot: '1.20.1' },
          versions: [
            {
              id: '1.20.1',
              type: 'release',
              url: `${mojangBase}/versions/1.20.1.json`,
              time: '2023-06-12T00:00:00+00:00',
              releaseTime: '2023-06-12T00:00:00+00:00',
              sha1: 'a'.repeat(40),
              complianceLevel: 1,
            },
          ],
        };
  res
    .writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify(body));
});
await new Promise((resolve) => mojangApi.listen(0, '127.0.0.1', resolve));
mojangBase = `http://127.0.0.1:${mojangApi.address().port}`;
const mcOpts = { version: '1.20.1', manifestBase: `${mojangBase}/m.json` };

const mc = await minecraft.resolveMinecraft(mcOpts);
check(
  'resolveMinecraft emits client jar, asset index and asset object',
  mc.artifacts.map((a) => a.path).join(',') ===
    '${version_dir}/client.jar,${assets_root}/indexes/5.json,${assets_root}/objects/0f/0f00',
);
check('resolveMinecraft names the version', mc.vars.version_name === '1.20.1');
check('resolveMinecraft gates the classpath per OS', mc.classpath.length === 3);

const { client } = await minecraft.fetchClient(mcOpts);
check(
  'a Client survives the round trip back into clientToTemplate',
  (await minecraft.clientToTemplate(client)).vars.version_name === '1.20.1',
);

const mcBuilt = await minecraft.buildMinecraft(mcOpts);
check('buildMinecraft names the plugin', mcBuilt.name === 'minecraft');

const withMc = dev.assemble([mcBuilt], {
  command: '${java_bin}',
  args: [mcBuilt.contribution.launch.mainClass],
});
check(
  'assemble accepts the minecraft contribution end to end',
  withMc.manifest.artifacts.length === 3 &&
    withMc.manifest.launch.args[0] === 'net.minecraft.client.main.Main',
);

mojangApi.close();

console.log(`\nresult: ${ok} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
