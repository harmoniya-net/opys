/**
 * The JS half of `@opys/modrinth`.
 *
 * Resolving versions and reading a `.mrpack` are the `opys-modrinth` crate's
 * and are tested there. What is tested here is what only exists on this side:
 * the `path` callback (called once per file, in order, with the file's info),
 * the loader a modpack is composed with, and that each wrapper reaches the
 * right native call.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { zipSync, strToU8 } from 'fflate';
import { definePlugin, type BuildContext } from '@opys/dev';
import {
  loaderSpec,
  modrinth,
  modrinthModpack,
  resolveModrinth,
  resolveModrinthModpack,
  MODRINTH_API,
  type LoaderSpec,
  type ModrinthFileInfo,
} from '../../lib/index';

const version = (id: string, filename: string, sha1?: string) => ({
  id,
  project_id: `P${id}`,
  version_number: `1.0-${id}`,
  files: [
    {
      filename,
      url: `https://cdn.modrinth.test/${filename}`,
      primary: true,
      size: 10,
      hashes: sha1 ? { sha1 } : {},
    },
  ],
});

const VERSIONS = [
  version('AAA', 'sodium.jar', 'a'.repeat(40)),
  version('BBB', 'pack.zip'),
];

const INDEX = {
  formatVersion: 1,
  game: 'minecraft',
  versionId: '1.0.0',
  name: 'Test Pack',
  dependencies: { minecraft: '1.20.1', 'fabric-loader': '0.15.11' },
  files: [
    {
      path: 'mods/sodium.jar',
      hashes: { sha1: 'a'.repeat(40) },
      env: { client: 'required', server: 'unsupported' },
      downloads: ['https://cdn.modrinth.test/sodium.jar'],
      fileSize: 1000,
    },
    {
      path: 'mods/server-only.jar',
      hashes: { sha1: 'c'.repeat(40) },
      env: { client: 'unsupported', server: 'required' },
      downloads: ['https://cdn.modrinth.test/server-only.jar'],
      fileSize: 2000,
    },
  ],
};

const MRPACK = zipSync({
  'modrinth.index.json': strToU8(JSON.stringify(INDEX)),
  'overrides/options.txt': strToU8('fov:90'),
});

/** Stands in for Modrinth's API and its CDN. */
let server: Server;
let base: string;
let targets: string[];

beforeEach(async () => {
  targets = [];
  server = createServer((req, res) => {
    const target = req.url ?? '';
    targets.push(target);
    if (target === '/data/pack.mrpack') {
      res.writeHead(200).end(MRPACK);
      return;
    }
    const body = target.startsWith('/versions?')
      ? VERSIONS.filter((v) => decodeURIComponent(target).includes(`"${v.id}"`))
      : target === '/version/PACK'
        ? {
            files: [
              {
                url: `${base}/data/pack.mrpack`,
                filename: 'pack.mrpack',
                primary: true,
              },
            ],
          }
        : undefined;
    if (body === undefined) {
      res.writeHead(404).end('unrouted');
      return;
    }
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

function makeCtx() {
  const logs: { scope: string; message: string }[] = [];
  const ctx: BuildContext = {
    log: (scope, message) => logs.push({ scope, message }),
    configDir: '/tmp',
    mode: '',
  };
  return { ctx, logs };
}

describe('MODRINTH_API', () => {
  it('comes from the crate rather than being restated here', () => {
    expect(MODRINTH_API).toBe('https://api.modrinth.com/v2');
  });
});

describe('resolveModrinth', () => {
  it('asks the author where each file goes, once each and in order', async () => {
    const seen: ModrinthFileInfo[] = [];
    const artifacts = await resolveModrinth(
      {
        apiBase: base,
        to: (info) => {
          seen.push(info);
          return `\${game_directory}/mods/${info.filename}`;
        },
      },
      ['BBB', 'https://modrinth.com/mod/sodium/version/AAA'],
    );

    expect(seen.map((i) => i.versionId)).toEqual(['BBB', 'AAA']);
    expect(seen[1]).toMatchObject({
      filename: 'sodium.jar',
      versionId: 'AAA',
      projectId: 'PAAA',
      versionNumber: '1.0-AAA',
      size: 10,
    });
    expect(artifacts.map((a) => a.path)).toEqual([
      '${game_directory}/mods/pack.zip',
      '${game_directory}/mods/sodium.jar',
    ]);
  });

  it('hands back artifacts the manifest types can read directly', async () => {
    const [sodium, pack] = await resolveModrinth(
      { apiBase: base, to: (i) => i.filename },
      ['AAA', 'BBB'],
    );
    expect(sodium).toEqual({
      path: 'sodium.jar',
      source: { url: 'https://cdn.modrinth.test/sodium.jar' },
      size: 10,
      integrity: { sha1: 'a'.repeat(40) },
    });
    expect(pack!.integrity).toBeUndefined();
  });

  it('makes no request and calls nothing for an empty list', async () => {
    const artifacts = await resolveModrinth(
      {
        apiBase: base,
        to: () => {
          throw new Error('called for no file');
        },
      },
      [],
    );
    expect(artifacts).toEqual([]);
    expect(targets).toEqual([]);
  });

  it('rejects with the crate’s error for an unknown version', async () => {
    await expect(
      resolveModrinth({ apiBase: base, to: (i) => i.filename }, ['GONE']),
    ).rejects.toThrow(/did not return metadata for version GONE/);
  });
});

describe('modrinth()', () => {
  it('is pure to construct, then logs a count and contributes artifacts', async () => {
    const plugin = modrinth({
      apiBase: base,
      to: (i) => `mods/${i.filename}`,
      versions: ['AAA', 'BBB'],
    });
    expect(plugin.name).toBe('modrinth');
    expect(targets).toEqual([]);

    const { ctx, logs } = makeCtx();
    const contribution = await plugin.build(ctx);
    expect(logs).toEqual([{ scope: 'modrinth', message: '2 file(s)' }]);
    expect(contribution.artifacts!.map((a) => a.path)).toEqual([
      'mods/sodium.jar',
      'mods/pack.zip',
    ]);
  });
});

describe('loaderSpec', () => {
  it('maps dependencies to a spec and throws the crate’s error for Quilt', () => {
    expect(loaderSpec({ minecraft: '1.20.1', forge: '47.4.20' })).toEqual({
      loader: 'forge',
      version: '1.20.1-47.4.20',
    });
    expect(() =>
      loaderSpec({ minecraft: '1.20.1', 'quilt-loader': '0.26.0' }),
    ).toThrow(/Quilt/);
  });
});

describe('resolveModrinthModpack', () => {
  it('returns the index, the client files, the overrides and the loader', async () => {
    const pack = await resolveModrinthModpack('PACK', { apiBase: base });

    expect(pack.index.name).toBe('Test Pack');
    expect(pack.loader).toEqual({
      loader: 'fabric',
      minecraft: '1.20.1',
      fabricLoader: '0.15.11',
    });
    expect(pack.files.map((f) => f.path)).toEqual([
      '${game_directory}/mods/sodium.jar',
    ]);
    expect(pack.overrides.path).toBe('${root}/cache/modrinth-modpack.mrpack');
    expect(pack.overrides.size).toBe(MRPACK.length);
    expect(targets).toEqual(['/version/PACK', '/data/pack.mrpack']);
  });
});

describe('modrinthModpack()', () => {
  /** A loader plugin that records the spec it was made from. */
  function fakeLoader(spec: LoaderSpec) {
    return definePlugin({
      name: `fake-${spec.loader}`,
      build: () => ({
        artifacts: [
          { path: '${version_dir}/client.jar', source: { url: 'https://x/c' } },
        ],
        vars: { classpath: 'cp' },
        launch: {
          command: 'java',
          jvmArgs: [],
          mainClass: 'net.fabricmc.Knot',
          gameArgs: [],
        },
        envs: { JAVA_HOME: '/jdk' },
      }),
    });
  }

  it('builds the loader the pack asks for and layers the pack over it', async () => {
    const specs: LoaderSpec[] = [];
    const plugin = modrinthModpack({
      pack: 'PACK',
      apiBase: base,
      loader: (spec) => {
        specs.push(spec);
        return fakeLoader(spec);
      },
    });
    expect(plugin.name).toBe('modrinthModpack');

    const { ctx, logs } = makeCtx();
    const contribution = await plugin.build(ctx);

    expect(specs).toEqual([
      { loader: 'fabric', minecraft: '1.20.1', fabricLoader: '0.15.11' },
    ]);
    // Loader first, then the pack's files, then the overrides archive.
    expect(contribution.artifacts!.map((a) => a.path)).toEqual([
      '${version_dir}/client.jar',
      '${game_directory}/mods/sodium.jar',
      '${root}/cache/modrinth-modpack.mrpack',
    ]);
    // The loader's launch surface is re-exposed under this plugin's name.
    expect(contribution.vars).toEqual({ classpath: 'cp' });
    expect(contribution.launch).toEqual({
      command: 'java',
      jvmArgs: [],
      mainClass: 'net.fabricmc.Knot',
      gameArgs: [],
    });
    expect(contribution.envs).toEqual({ JAVA_HOME: '/jdk' });
    expect(logs).toEqual([
      {
        scope: 'modrinthModpack',
        message: 'Test Pack — fake-fabric + 1 file(s)',
      },
    ]);
  });
});
