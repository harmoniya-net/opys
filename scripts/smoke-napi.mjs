#!/usr/bin/env node
// End-to-end smoke test for the napi bindings. Loads all eight .node files,
// exercises core decode/encode/resolve, the mojang parsers, the dev engine's
// merge, a java resolve against a loopback stand-in for the Adoptium API, a
// vanilla Minecraft resolve against one for the Mojang endpoints, and fabric
// and forge resolves against stand-ins for their indexes plus Mojang, then
// runs an
// actual `install` from runtime-napi against a tmpdir with a string source.
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
const minecraft = require('../crates/opys-minecraft-vanilla-napi/index.js');
const fabricNapi = require('../crates/opys-fabric-napi/index.js');
const forgeNapi = require('../crates/opys-forge-napi/index.js');

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

// ── fabric ────────────────────────────────────────────────────────────────
// Its own `.node`, but the same Mojang stand-in: the profile names `1.20.1`
// as what it inherits from, so the crossing exercised here is Meta → profile
// → the vanilla chain → the fold.
console.log('\n— fabric —');

const FABRIC_PROFILE = {
  id: 'fabric-loader-0.16.10-1.20.1',
  inheritsFrom: '1.20.1',
  mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
  arguments: {
    game: [],
    jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '],
  },
  libraries: [
    {
      name: 'net.fabricmc:fabric-loader:0.16.10',
      url: 'https://maven.fabricmc.net/',
      sha1: 'a'.repeat(40),
      size: 2000,
    },
  ],
};

let metaBase = '';
const fabricMeta = createServer((req, res) => {
  const target = req.url ?? '';
  const body = target.endsWith('/profile/json')
    ? FABRIC_PROFILE
    : [{ loader: { version: '0.16.10', stable: true } }];
  res
    .writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify(body));
});
await new Promise((resolve) => fabricMeta.listen(0, '127.0.0.1', resolve));
metaBase = `http://127.0.0.1:${fabricMeta.address().port}`;
const fabricOpts = { ...mcOpts, source: metaBase };

check(
  'defaultFabricMeta is the canonical URL',
  fabricNapi.defaultFabricMeta() === 'https://meta.fabricmc.net',
);

const release = await fabricNapi.resolveFabricVersion('1.20.1', metaBase, null);
check(
  'resolveFabricVersion picks the stable build and spells the profile URL',
  release.loaderVersion === '0.16.10' &&
    release.profileUrl ===
      `${metaBase}/v2/versions/loader/1.20.1/0.16.10/profile/json`,
);

const fab = await fabricNapi.resolveFabric(fabricOpts);
check(
  'resolveFabric appends the loader jar after the vanilla artifacts',
  fab.artifacts.at(-1).path ===
    '${library_directory}/net/fabricmc/fabric-loader/0.16.10/fabric-loader-0.16.10.jar',
);
check(
  'resolveFabric launches the loader, not vanilla',
  fab.mainClass === 'net.fabricmc.loader.impl.launch.knot.KnotClient',
);
check(
  "resolveFabric merges the profile jvm args after vanilla's",
  fab.jvmArgs.at(-1) === '-DFabricMcEmu= net.minecraft.client.main.Main ',
);

const fabBuilt = await fabricNapi.buildFabric(fabricOpts);
check('buildFabric names the plugin', fabBuilt.name === 'fabric');

const withFabric = dev.assemble([fabBuilt], {
  command: '${java_bin}',
  args: [fabBuilt.contribution.launch.mainClass],
});
check(
  'assemble accepts the fabric contribution end to end',
  withFabric.manifest.artifacts.length === 4 &&
    withFabric.manifest.launch.args[0] ===
      'net.fabricmc.loader.impl.launch.knot.KnotClient',
);

fabricMeta.close();

// ── forge ─────────────────────────────────────────────────────────────────
// Same shape as fabric, and deliberately so: a published `inheritsFrom`
// document instead of a Meta profile, folded onto the same vanilla chain.
console.log('\n— forge —');

const FORGE_BUILD = '1.20.1-47.4.10';
const FORGE_DOCUMENT = {
  id: '1.20.1-forge-47.4.10',
  inheritsFrom: '1.20.1',
  mainClass: 'io.github.zekerzhayard.forgewrapper.installer.Main',
  arguments: {
    game: ['--launchTarget', 'forgeclient'],
    jvm: ['-Dforgewrapper.librariesDir=${library_directory}'],
  },
  libraries: [
    {
      name: 'cpw.mods:securejarhandler:2.1.10',
      downloads: {
        artifact: {
          path: 'cpw/mods/securejarhandler/2.1.10/securejarhandler-2.1.10.jar',
          url: 'https://maven/sjh.jar',
          sha1: 'b'.repeat(40),
          size: 2000,
        },
      },
    },
  ],
};

let forgeBase = '';
const forgeSite = createServer((req, res) => {
  const target = req.url ?? '';
  const url = `${forgeBase}/versions/1.20.1/${FORGE_BUILD}.json`;
  const body = target.startsWith('/versions/')
    ? FORGE_DOCUMENT
    : {
        versions: {
          '1.20.1': {
            latest: FORGE_BUILD,
            latestUrl: url,
            recommended: FORGE_BUILD,
            recommendedUrl: url,
            best: FORGE_BUILD,
            bestUrl: url,
            builds: [{ forge: FORGE_BUILD, url }],
          },
        },
      };
  res
    .writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify(body));
});
await new Promise((resolve) => forgeSite.listen(0, '127.0.0.1', resolve));
forgeBase = `http://127.0.0.1:${forgeSite.address().port}`;
const forgeOpts = { ...mcOpts, source: forgeBase };

check(
  'defaultForgeIndex is the canonical URL',
  forgeNapi.defaultForgeIndex() ===
    'https://harmoniya-net.github.io/ForgeWrapper',
);

const forgeRelease = await forgeNapi.resolveForgeVersion('1.20.1', forgeBase);
check(
  'resolveForgeVersion picks the best build and spells the document URL',
  forgeRelease.forge === FORGE_BUILD &&
    forgeRelease.documentUrl ===
      `${forgeBase}/versions/1.20.1/${FORGE_BUILD}.json`,
);

const forged = await forgeNapi.resolveForge(forgeOpts);
check(
  'resolveForge launches the wrapper, not vanilla',
  forged.mainClass === 'io.github.zekerzhayard.forgewrapper.installer.Main',
);
check(
  "resolveForge puts forge's libraries on the classpath behind the client jar",
  // The stand-in vanilla version lists no libraries, so what this can show is
  // that forge's own land in the arm at all, right after the client jar.
  // Their order relative to vanilla's is the crate's test to make.
  forged.classpath[0].value ===
    '${version_dir}/client.jar${classpath_separator}' +
      '${library_directory}/cpw/mods/securejarhandler/2.1.10/securejarhandler-2.1.10.jar',
);

const forgeBuilt = await forgeNapi.buildForge(forgeOpts);
check('buildForge names the plugin', forgeBuilt.name === 'forge');

forgeSite.close();
mojangApi.close();

console.log(`\nresult: ${ok} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
