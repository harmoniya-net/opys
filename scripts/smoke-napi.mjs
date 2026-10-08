#!/usr/bin/env node
// End-to-end smoke test for the napi bindings. Loads every .node file,
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
const neoforgeNapi = require('../crates/opys-neoforge-napi/index.js');
const cleanroomNapi = require('../crates/opys-cleanroom-napi/index.js');
const lwjgl3ifyNapi = require('../crates/opys-lwjgl3ify-napi/index.js');
const authlibertyNapi = require('../crates/opys-authliberty-napi/index.js');
const modrinthNapi = require('../crates/opys-modrinth-napi/index.js');
const curseforgeNapi = require('../crates/opys-curseforge-napi/index.js');
const linkNapi = require('../crates/opys-links-napi/index.js');
const dgpujNapi = require('../crates/opys-dgpuj-napi/index.js');
const bifrostNapi = require('../crates/opys-bifrost-napi/index.js');
const serverlistNapi = require('../crates/opys-minecraft-serverlist-napi/index.js');

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
      {
        path: 'linux.jar',
        source: { url: 'https://x' },
        rules: 'allow.os.linux',
      },
      { path: 'any.jar', source: { url: 'https://x' } },
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
// One blob, held as bytes: the manifest names it, the table says where it is.
const world = Buffer.from('world');
const worldId = core.blobId(world);
const helloManifest = {
  vars: { root: dir },
  launch: { command: 'java', workdir: '${root}', args: ['-jar', 'a.jar'] },
  artifacts: [{ path: '${root}/hello.txt', source: { blob: worldId } }],
};
const helloBlobs = { [worldId]: { bytes: world.toString('base64') } };
await runtime.install(
  { manifest: helloManifest, blobs: helloBlobs },
  { verifyIntegrity: true },
  (event) => events.push(event.phase),
);

const written = readFileSync(join(dir, 'hello.txt'), 'utf8');
check('install copies a blob to disk', written === 'world');

// The same thing published: one file, read back and installed elsewhere.
const bundlePath = join(dir, 'hello.opys');
await core.writeBundle(bundlePath, helloManifest, helloBlobs);
check(
  'writeBundle writes a zip whose head reads without the list',
  readFileSync(bundlePath).subarray(0, 2).toString() === 'PK' &&
    core.readBundleHead(bundlePath).format === core.bundleFormat() &&
    core.readBundleHead(bundlePath).artifacts === undefined,
);
check(
  'readBundle gives back the manifest that was written',
  core.readBundle(bundlePath).artifacts[0].source.blob === worldId,
);
const elsewhere = mkdtempSync(join(tmpdir(), 'opys-napi-bundle-'));
const prepared = await runtime.prepare(
  { bundle: bundlePath },
  { vars: { root: elsewhere } },
  {},
);
check(
  'prepare installs from a bundle and says what to spawn',
  readFileSync(join(elsewhere, 'hello.txt'), 'utf8') === 'world' &&
    prepared.workdir === elsewhere,
);
check(
  'hashBlobFile names a file the way blobId names its bytes',
  (await core.hashBlobFile(join(elsewhere, 'hello.txt'))).id === worldId,
);
check(
  'a source the format dropped is refused by name',
  (() => {
    try {
      core.decodeManifest({
        artifacts: [{ path: 'a', source: { string: 'x' } }],
      });
      return false;
    } catch (e) {
      return /unknown field `string`/.test(e.message);
    }
  })(),
);
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
        artifacts: [
          { path: 'a.jar', source: { url: 'https://x/b' } },
          { path: 'hello.txt', source: { blob: worldId } },
        ],
        blobs: helloBlobs,
        vars: { root: 'clash' },
        envs: { E: '1' },
      },
    },
  ],
  {
    command: 'java',
    args: [[{ rules: [], value: ['-Xmx2G'] }], 'Main'],
    cleanup: [{ includes: ['/srv/mods/**'] }],
  },
);
check(
  'assemble dedupes by path, last content wins',
  assembled.manifest.artifacts.length === 2 &&
    assembled.manifest.artifacts[0].source.url === 'https://x/b',
);
check(
  'assemble carries the blobs the manifest names',
  JSON.stringify(assembled.blobs) === JSON.stringify(helloBlobs),
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
  'assemble merges plugin envs and emits cleanup',
  assembled.manifest.launch.envs.E === '1' &&
    JSON.stringify(assembled.manifest.cleanup) ===
      JSON.stringify([{ includes: ['/srv/mods/**'] }]),
);

const spec = await runtime.buildLaunch({
  manifest: {
    vars: { root: dir, jvm: '/usr/bin/java' },
    launch: { command: '${jvm}', workdir: '${root}', args: ['-version'] },
    artifacts: [],
  },
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
  mainClass: 'net.harmoniya.horno.Main',
  arguments: {
    game: ['--launchTarget', 'forgeclient'],
    jvm: ['-Dhorno.librariesDir=${library_directory}'],
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
            builds: [{ build: FORGE_BUILD, url }],
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
    'https://harmoniya-net.github.io/metadata/forge',
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
  forged.mainClass === 'net.harmoniya.horno.Main',
);
check(
  "resolveForge puts forge's libraries ahead of the client jar",
  // The stand-in vanilla version lists no libraries, so what this can show is
  // that forge's own land in the arm at all, ahead of the client jar. Their
  // order relative to vanilla's is the crate's test to make.
  forged.classpath[0].value ===
    '${library_directory}/cpw/mods/securejarhandler/2.1.10/securejarhandler-2.1.10.jar' +
      '${classpath_separator}${version_dir}/client.jar',
);

const forgeBuilt = await forgeNapi.buildForge(forgeOpts);
check('buildForge names the plugin', forgeBuilt.name === 'forge');

forgeSite.close();

// ── neoforge ──────────────────────────────────────────────────────────────
// The same index, the same fold, a different maven. What this crosses that
// forge cannot is a build id that shares no text with its Minecraft version.
console.log('\n— neoforge —');

const NEOFORGE_BUILD = '21.1.172';
const NEOFORGE_DOCUMENT = {
  id: `neoforge-${NEOFORGE_BUILD}`,
  inheritsFrom: '1.20.1',
  mainClass: 'net.harmoniya.horno.Main',
  arguments: {
    game: ['--fml.neoForgeVersion', NEOFORGE_BUILD],
    jvm: ['-Dhorno.librariesDir=${library_directory}'],
  },
  libraries: [
    {
      name: 'net.neoforged.fancymodloader:loader:4.0.39',
      downloads: {
        artifact: {
          path: 'net/neoforged/fancymodloader/loader/4.0.39/loader-4.0.39.jar',
          url: 'https://maven/loader.jar',
          sha1: 'c'.repeat(40),
          size: 3000,
        },
      },
    },
  ],
};

let neoforgeBase = '';
const neoforgeSite = createServer((req, res) => {
  const target = req.url ?? '';
  const url = `${neoforgeBase}/versions/1.20.1/${NEOFORGE_BUILD}.json`;
  const body = target.startsWith('/versions/')
    ? NEOFORGE_DOCUMENT
    : {
        versions: {
          '1.20.1': {
            latest: NEOFORGE_BUILD,
            latestUrl: url,
            recommended: NEOFORGE_BUILD,
            recommendedUrl: url,
            best: NEOFORGE_BUILD,
            bestUrl: url,
            builds: [{ build: NEOFORGE_BUILD, url }],
          },
        },
      };
  res
    .writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify(body));
});
await new Promise((resolve) => neoforgeSite.listen(0, '127.0.0.1', resolve));
neoforgeBase = `http://127.0.0.1:${neoforgeSite.address().port}`;
const neoforgeOpts = { ...mcOpts, source: neoforgeBase };

check(
  'defaultNeoForgeIndex is the canonical URL',
  neoforgeNapi.defaultNeoForgeIndex() ===
    'https://harmoniya-net.github.io/metadata/neoforge',
);

const neoforgeRelease = await neoforgeNapi.resolveNeoForgeVersion(
  NEOFORGE_BUILD,
  neoforgeBase,
);
check(
  'resolveNeoForgeVersion finds a build id that names no Minecraft version',
  neoforgeRelease.minecraft === '1.20.1' &&
    neoforgeRelease.neoforge === NEOFORGE_BUILD,
);

const neoforged = await neoforgeNapi.resolveNeoForge(neoforgeOpts);
check(
  'resolveNeoForge launches the wrapper, not vanilla',
  neoforged.mainClass === 'net.harmoniya.horno.Main',
);
check(
  "resolveNeoForge puts neoforge's libraries ahead of the client jar",
  neoforged.classpath[0].value ===
    '${library_directory}/net/neoforged/fancymodloader/loader/4.0.39/loader-4.0.39.jar' +
      '${classpath_separator}${version_dir}/client.jar',
);

const neoforgeBuilt = await neoforgeNapi.buildNeoForge(neoforgeOpts);
check('buildNeoForge names the plugin', neoforgeBuilt.name === 'neoforge');

neoforgeSite.close();

// ── cleanroom ─────────────────────────────────────────────────────────────
// The same index over a different kind of document: a complete version JSON,
// so the crossing reads it as a client and never asks Mojang for a version.
console.log('\n— cleanroom —');

const CLEANROOM_TAG = '0.6.13-alpha';
const CLEANROOM_JAR = `com/cleanroommc/cleanroom/${CLEANROOM_TAG}/cleanroom-${CLEANROOM_TAG}.jar`;

let cleanroomBase = '';
const cleanroomSite = createServer((req, res) => {
  const target = req.url ?? '';
  const url = `${cleanroomBase}/versions/1.12.2/${CLEANROOM_TAG}.json`;
  const { arguments: _modern, ...client } = CLIENT_JSON('1.12.2', mojangBase);
  const body = target.startsWith('/versions/')
    ? {
        ...client,
        mainClass: 'top.outlands.foundation.boot.Foundation',
        minecraftArguments: '--username ${auth_player_name}',
        libraries: [
          {
            name: `com.cleanroommc:cleanroom:${CLEANROOM_TAG}`,
            downloads: {
              artifact: {
                path: CLEANROOM_JAR,
                sha1: 'a'.repeat(40),
                size: 2000,
                url: `https://example.invalid/cleanroom-${CLEANROOM_TAG}-universal.jar`,
              },
            },
          },
        ],
      }
    : {
        versions: {
          '1.12.2': {
            latest: CLEANROOM_TAG,
            latestUrl: url,
            recommended: CLEANROOM_TAG,
            recommendedUrl: url,
            best: CLEANROOM_TAG,
            bestUrl: url,
            builds: [{ build: CLEANROOM_TAG, url }],
          },
        },
      };
  res
    .writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify(body));
});
await new Promise((resolve) => cleanroomSite.listen(0, '127.0.0.1', resolve));
cleanroomBase = `http://127.0.0.1:${cleanroomSite.address().port}`;
const cleanroomOpts = { version: CLEANROOM_TAG, source: cleanroomBase };

check(
  'defaultCleanroomIndex is the published index',
  cleanroomNapi.defaultCleanroomIndex() ===
    'https://harmoniya-net.github.io/metadata/cleanroom',
);

const cleanroomRelease = await cleanroomNapi.resolveCleanroomVersion(
  CLEANROOM_TAG,
  cleanroomBase,
);
check(
  'resolveCleanroomVersion finds a tag that names no Minecraft version',
  cleanroomRelease.minecraft === '1.12.2' &&
    cleanroomRelease.cleanroom === CLEANROOM_TAG,
);

const cleanroomed = await cleanroomNapi.resolveCleanroom(cleanroomOpts);
check(
  "resolveCleanroom launches the document's own main class",
  cleanroomed.mainClass === 'top.outlands.foundation.boot.Foundation',
);
check(
  'resolveCleanroom puts the cleanroom jar ahead of the client jar',
  cleanroomed.classpath[0].value ===
    `\${library_directory}/${CLEANROOM_JAR}` +
      '${classpath_separator}${version_dir}/client.jar',
);

const cleanroomBuilt = await cleanroomNapi.buildCleanroom(cleanroomOpts);
check('buildCleanroom names the plugin', cleanroomBuilt.name === 'cleanroom');

cleanroomSite.close();

// ── lwjgl3ify ─────────────────────────────────────────────────────────────
// A document like cleanroom's, plus the one thing no other loader here does:
// a second source, GitHub, for the jars that go in `mods/`.
console.log('\n— lwjgl3ify —');

const LWJGL3IFY_TAG = '3.0.37';

let lwjgl3ifyBase = '';
const lwjgl3ifySite = createServer((req, res) => {
  const target = req.url ?? '';
  const url = `${lwjgl3ifyBase}/versions/1.7.10/${LWJGL3IFY_TAG}.json`;
  const body = target.startsWith('/repos/')
    ? {
        tag_name: LWJGL3IFY_TAG,
        prerelease: false,
        draft: false,
        published_at: '2026-10-04T00:00:00Z',
        assets: [
          {
            name: `lwjgl3ify-${LWJGL3IFY_TAG}.jar`,
            size: 4242,
            browser_download_url: `https://example.invalid/lwjgl3ify-${LWJGL3IFY_TAG}.jar`,
            digest: `sha256:${'d'.repeat(64)}`,
          },
        ],
      }
    : target.startsWith('/versions/')
      ? CLIENT_JSON('1.7.10', mojangBase)
      : {
          versions: {
            '1.7.10': {
              latest: LWJGL3IFY_TAG,
              latestUrl: url,
              recommended: LWJGL3IFY_TAG,
              recommendedUrl: url,
              best: LWJGL3IFY_TAG,
              bestUrl: url,
              builds: [{ build: LWJGL3IFY_TAG, url }],
            },
          },
        };
  res
    .writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify(body));
});
await new Promise((resolve) => lwjgl3ifySite.listen(0, '127.0.0.1', resolve));
lwjgl3ifyBase = `http://127.0.0.1:${lwjgl3ifySite.address().port}`;
const lwjgl3ifyOpts = {
  version: LWJGL3IFY_TAG,
  source: lwjgl3ifyBase,
  apiBase: lwjgl3ifyBase,
  unimixins: false,
};

check(
  'defaultLwjgl3ifyIndex is the published index',
  lwjgl3ifyNapi.defaultLwjgl3ifyIndex() ===
    'https://harmoniya-net.github.io/metadata/lwjgl3ify',
);

const lwjgl3ifyRelease = await lwjgl3ifyNapi.resolveLwjgl3ifyVersion(
  LWJGL3IFY_TAG,
  lwjgl3ifyBase,
);
check(
  'resolveLwjgl3ifyVersion finds a tag that names no Minecraft version',
  lwjgl3ifyRelease.minecraft === '1.7.10' &&
    lwjgl3ifyRelease.lwjgl3ify === LWJGL3IFY_TAG,
);

const lwjgl3ified = await lwjgl3ifyNapi.resolveLwjgl3ify(lwjgl3ifyOpts);
check(
  'resolveLwjgl3ify puts the mod jar under mods/',
  lwjgl3ified.artifacts.some(
    (a) => a.path === `\${game_directory}/mods/lwjgl3ify-${LWJGL3IFY_TAG}.jar`,
  ),
);
check(
  'resolveLwjgl3ify takes `unimixins: false` as an opt-out',
  !lwjgl3ified.artifacts.some((a) => a.path.includes('unimixins')),
);

const lwjgl3ifyBuilt = await lwjgl3ifyNapi.buildLwjgl3ify(lwjgl3ifyOpts);
check('buildLwjgl3ify names the plugin', lwjgl3ifyBuilt.name === 'lwjgl3ify');

lwjgl3ifySite.close();

// ── authliberty ───────────────────────────────────────────────────────────
// Not a loader: one jar off a GitLab package registry and the JVM arguments
// that load it. The crossing carries a nested options object, `hosts`.
console.log('\n— authliberty —');

const gitlabApi = createServer((req, res) => {
  const body = (req.url ?? '').includes('/package_files')
    ? [
        {
          id: 1,
          package_id: 100,
          file_name: 'authliberty-0.3.jar',
          size: 4096,
          file_sha256: 'cafef00d',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]
    : [
        {
          id: 100,
          name: 'authliberty',
          version: '0.3',
          package_type: 'generic',
          status: 'default',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];
  res
    .writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify(body));
});
await new Promise((resolve) => gitlabApi.listen(0, '127.0.0.1', resolve));
const gitlabBase = `http://127.0.0.1:${gitlabApi.address().port}`;
const AGENT =
  '${library_directory}/net/harmoniya/authliberty/0.3/authliberty-0.3.jar';

const agentRelease = await authlibertyNapi.resolveAuthLibertyVersion('0.3', {
  gitlab: gitlabBase,
});
check(
  'resolveAuthLibertyVersion reads the jar and its sha256 off the registry',
  agentRelease.filename === 'authliberty-0.3.jar' &&
    agentRelease.sha256 === 'cafef00d' &&
    agentRelease.createdAt === '2024-01-01T00:00:00Z',
);

const agentOpts = {
  version: '0.3',
  gitlab: gitlabBase,
  hosts: { session: 'https://session.example' },
};
const agent = await authlibertyNapi.resolveAuthliberty(agentOpts);
check(
  'resolveAuthliberty puts the jar at its maven-shaped path',
  agent.artifacts.length === 1 && agent.artifacts[0].path === AGENT,
);
check(
  'resolveAuthliberty writes the agent argument, then the configured host',
  agent.jvmArgs.join(' ') ===
    `-javaagent:${AGENT} -Dminecraft.api.session.host=https://session.example`,
);

const agentBuilt = await authlibertyNapi.buildAuthliberty(agentOpts);
check(
  'buildAuthliberty names the plugin and exposes only jvmArgs',
  agentBuilt.name === 'authliberty' &&
    Object.keys(agentBuilt.contribution.launch).join() === 'jvmArgs',
);

gitlabApi.close();

// ── modrinth ──────────────────────────────────────────────────────────────
// Two crossings no other addon makes: a plain array of strings in, and a
// second, synchronous call that pairs the files with paths chosen on this
// side — the config author's callback never crosses.
console.log('\n— modrinth —');

const modrinthApi = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' }).end(
    JSON.stringify([
      {
        id: 'AAA',
        project_id: 'PAAA',
        version_number: '0.5.8',
        files: [
          {
            filename: 'sodium.jar',
            url: 'https://example.invalid/sodium.jar',
            primary: true,
            size: 1234,
            hashes: { sha1: 'a'.repeat(40) },
          },
        ],
      },
    ]),
  );
});
await new Promise((resolve) => modrinthApi.listen(0, '127.0.0.1', resolve));
const modrinthBase = `http://127.0.0.1:${modrinthApi.address().port}`;

check(
  'defaultModrinthApi is the public API',
  modrinthNapi.defaultModrinthApi() === 'https://api.modrinth.com/v2',
);

const modFiles = await modrinthNapi.resolveModrinthFiles(
  ['https://modrinth.com/mod/sodium/version/AAA'],
  modrinthBase,
);
check(
  'resolveModrinthFiles returns what a path callback is given',
  modFiles.length === 1 &&
    modFiles[0].filename === 'sodium.jar' &&
    modFiles[0].versionId === 'AAA' &&
    modFiles[0].projectId === 'PAAA' &&
    modFiles[0].versionNumber === '0.5.8',
);

const modArtifacts = modrinthNapi.modrinthFileArtifacts(modFiles, [
  '${game_directory}/mods/sodium.jar',
]);
check(
  'modrinthFileArtifacts puts each file at the path chosen for it',
  modArtifacts[0].path === '${game_directory}/mods/sodium.jar' &&
    modArtifacts[0].integrity.sha1 === 'a'.repeat(40),
);
check(
  'modrinthFileArtifacts refuses a path list of the wrong length',
  (() => {
    try {
      modrinthNapi.modrinthFileArtifacts(modFiles, []);
      return false;
    } catch (e) {
      return /each file needs exactly one/.test(e.message);
    }
  })(),
);
check(
  'loaderSpec fuses minecraft and forge into one build id',
  modrinthNapi.loaderSpec({ minecraft: '1.20.1', forge: '47.4.20' }).version ===
    '1.20.1-47.4.20',
);

modrinthApi.close();

// ── curseforge ────────────────────────────────────────────────────────────
// The one addon that POSTs, and the one whose references are a number or a
// string — both spellings have to arrive as what they were.
console.log('\n— curseforge —');

let curseforgeKey = '';
const curseforgeApi = createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    curseforgeKey = req.headers['x-api-key'] ?? '';
    const { fileIds } = JSON.parse(raw);
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        data: fileIds.map((id) => ({
          id,
          modId: 1,
          fileName: `mod-${id}.jar`,
          fileLength: 10,
          hashes: [{ value: 'a'.repeat(40), algo: 1 }],
          downloadUrl: null,
        })),
      }),
    );
  });
});
await new Promise((resolve) => curseforgeApi.listen(0, '127.0.0.1', resolve));
const curseforgeBase = `http://127.0.0.1:${curseforgeApi.address().port}`;

check(
  'defaultCurseforgeApi is the public API',
  curseforgeNapi.defaultCurseforgeApi() === 'https://api.curseforge.com/v1',
);
check(
  'parseFileRef reads a number and a URL alike',
  curseforgeNapi.parseFileRef(6307712) === 6307712 &&
    curseforgeNapi.parseFileRef('https://x/files/2283837') === 2283837,
);

const cfFiles = await curseforgeNapi.resolveCurseforgeFiles(
  'smoke-key',
  [6307712, 'https://www.curseforge.com/minecraft/mc-mods/x/files/2283837'],
  curseforgeBase,
);
check(
  'resolveCurseforgeFiles sends the key and keeps the order asked for',
  curseforgeKey === 'smoke-key' &&
    cfFiles.map((f) => f.fileId).join() === '6307712,2283837',
);
check(
  'resolveCurseforgeFiles addresses a withheld file on the CDN',
  cfFiles[0].url === 'https://edge.forgecdn.net/files/6307/712/mod-6307712.jar',
);

const cfArtifacts = curseforgeNapi.curseforgeFileArtifacts(cfFiles, [
  'mods/a.jar',
  'mods/b.jar',
]);
check(
  'curseforgeFileArtifacts puts each file at the path chosen for it',
  cfArtifacts.map((a) => a.path).join() === 'mods/a.jar,mods/b.jar',
);
check(
  'loaderSpecFromManifest reads the primary loader',
  curseforgeNapi.loaderSpecFromManifest({
    minecraft: {
      version: '1.20.1',
      modLoaders: [{ id: 'fabric-0.15.11', primary: true }],
    },
    files: [],
    overrides: 'overrides',
    name: 'Pack',
  }).fabricLoader === '0.15.11',
);

curseforgeApi.close();

// ── link ──────────────────────────────────────────────────────────────────
// A plain URL, the provider of last resort: nobody publishes a hash for it,
// so the addon downloads the file and computes one. That is a binary read and
// a sha256 behind the boundary, which nothing above exercises.
console.log('\n— link —');

const fileHost = createServer((_req, res) => res.writeHead(200).end('hello'));
await new Promise((resolve) => fileHost.listen(0, '127.0.0.1', resolve));
const fileUrl = `http://127.0.0.1:${fileHost.address().port}/files/hello.txt`;

const linked = await linkNapi.resolveLinks([fileUrl], {});
check(
  'resolveLinks pins a plain URL by downloading and hashing it',
  linked.length === 1 &&
    linked[0].provider === 'url' &&
    linked[0].filename === 'hello.txt' &&
    linked[0].size === 5 &&
    linked[0].integrity.sha256 ===
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
);
check(
  'linkFileArtifacts puts the file at the path chosen for it',
  linkNapi.linkFileArtifacts(linked, ['${root}/hello.txt'])[0].path ===
    '${root}/hello.txt',
);
check(
  'resolveLinks refuses what is not a link, before any request',
  await linkNapi.resolveLinks(['sodium'], {}).then(
    () => false,
    (e) => /is not a link/.test(e.message),
  ),
);

fileHost.close();

// ── dgpuj ─────────────────────────────────────────────────────────────────
// A stand-in for GitHub's releases API: one release, one target's archive.

console.log('\n— dgpuj —');

const DGPUJ_ASSET = 'dgpuj-x86_64-unknown-linux-gnu.tar.gz';
const dgpujApi = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' }).end(
    JSON.stringify([
      {
        tag_name: 'v0.3.0',
        prerelease: false,
        draft: false,
        published_at: '2026-06-22T00:00:00Z',
        assets: [
          {
            name: DGPUJ_ASSET,
            size: 4242,
            browser_download_url: `https://example.invalid/${DGPUJ_ASSET}`,
            digest: `sha256:${'a'.repeat(64)}`,
          },
        ],
      },
    ]),
  );
});
await new Promise((resolve) => dgpujApi.listen(0, '127.0.0.1', resolve));
const dgpujOpts = {
  apiBase: `http://127.0.0.1:${dgpujApi.address().port}`,
  platforms: [
    {
      os: 'linux',
      arch: 'x86_64',
      target: 'x86_64-unknown-linux-gnu',
      ext: 'tar.gz',
      bin: 'dgpuj',
    },
  ],
};

check(
  'defaultDgpujRepo is where dgpuj is published',
  dgpujNapi.defaultDgpujRepo() === 'harmoniya-net/dgpuj',
);
check(
  'defaultDgpujPlatforms lists the published targets',
  dgpujNapi.defaultDgpujPlatforms().length === 5,
);
const dgpujResolved = await dgpujNapi.resolveDgpuj(dgpujOpts);
check(
  'resolveDgpuj pins the archive for each target',
  dgpujResolved.release.tag_name === 'v0.3.0' &&
    dgpujResolved.artifacts.length === 1 &&
    dgpujResolved.artifacts[0].path === `\${dgpuj_dir}/${DGPUJ_ASSET}` &&
    dgpujResolved.artifacts[0].integrity.sha256 === 'a'.repeat(64),
);
const dgpujBuilt = await dgpujNapi.buildDgpuj(dgpujOpts);
check('buildDgpuj names the plugin', dgpujBuilt.output.name === 'dgpuj');

dgpujApi.close();

// ── bifrost ───────────────────────────────────────────────────────────────

console.log('\n— bifrost —');

// A throwaway key made for this script; it signs nothing anyone trusts.
const BIFROST_KEY =
  'MC4CAQAwBQYDK2VwBCIEIJ+DYvh6SEqVTm50DFtMDoQikTmiCqirVv9mWG9qfSnF';
const minted = bifrostNapi.mintBifrost({
  privateKey: BIFROST_KEY,
  username: 'Player',
  uuid: 'AAAA-bbbb',
  now: 1704067200000,
});
const claims = JSON.parse(
  Buffer.from(minted.token.split('.')[1], 'base64url').toString('utf8'),
);
check(
  'mintBifrost signs the claims Bifrost reads',
  minted.uuid === 'aaaabbbb' &&
    claims.uuid === 'aaaabbbb' &&
    claims.username === 'Player' &&
    claims.exp - claims.iat === bifrostNapi.defaultBifrostTtl(),
);
check(
  'mintBifrost says where a missing key comes from',
  (() => {
    try {
      bifrostNapi.mintBifrost({ privateKey: '', username: 'a', uuid: 'b' });
      return false;
    } catch (e) {
      return /privateKey is required/.test(e.message);
    }
  })(),
);

// ── serverlist ────────────────────────────────────────────────────────────

console.log('\n— serverlist —');

const listed = serverlistNapi.buildServerlist(
  [
    { name: 'Home', ip: 'play.example' },
    { name: 'Linux', ip: 'linux.example', rules: 'allow.os.linux' },
  ],
  {},
);
check(
  'buildServerlist names the plugin and splits the list by ruleset',
  listed.name === 'serverlist' &&
    listed.contribution.artifacts.length === 2 &&
    listed.contribution.artifacts.every(
      (a) => a.path === serverlistNapi.defaultServerlistPath(),
    ),
);
const listedBlob = listed.contribution.artifacts[0].source.blob;
check(
  'buildServerlist carries each list as a blob named by its hash',
  core.blobId(
    Buffer.from(listed.contribution.blobs[listedBlob].bytes, 'base64'),
  ) === listedBlob,
);

// ── scanner ───────────────────────────────────────────────────────────────

console.log('\n— scanner —');

const scanned = await dev.scanDirectory(elsewhere);
check(
  'scanDirectory finds the files under a directory',
  scanned.length === 1 &&
    scanned[0].rel === 'hello.txt' &&
    scanned[0].size === 5,
);
const scannedBlob = await dev.scannedFiles([
  { abs: scanned[0].abs, path: '${root}/hello.txt' },
]);
check(
  'scannedFiles makes a file with no url a blob read from where it is',
  scannedBlob.artifacts[0].source.blob === worldId &&
    scannedBlob.blobs[worldId].file === scanned[0].abs,
);
const scannedUrl = await dev.scannedFiles(
  [{ abs: scanned[0].abs, path: 'hello.txt', url: 'https://cdn/hello.txt' }],
  'sha256',
);
check(
  'scannedFiles pins a file with a url and carries nothing',
  scannedUrl.artifacts[0].integrity.sha256 === worldId &&
    Object.keys(scannedUrl.blobs).length === 0,
);
mojangApi.close();

console.log(`\nresult: ${ok} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
