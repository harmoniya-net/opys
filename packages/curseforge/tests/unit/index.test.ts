/**
 * The JS half of `@opys/curseforge`.
 *
 * Looking files up and reading a modpack archive are the `opys-curseforge`
 * crate's and are tested there. What is tested here is what only exists on
 * this side: the `path` callback (called once per file, in order, with the
 * file's info and nothing more), the loader a modpack is composed with, that a
 * reference written as a number or as a string both cross intact, and that
 * each wrapper reaches the right native call.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { zipSync, strToU8 } from 'fflate';
import { definePlugin, type BuildContext } from '@opys/dev';
import {
  curseforge,
  curseforgeModpack,
  fetchCurseforgeFiles,
  loaderSpecFromManifest,
  parseFileRef,
  resolveCurseforge,
  resolveCurseforgeModpack,
  CURSEFORGE_API,
  type CurseForgeFileInfo,
  type LoaderSpec,
} from '../../lib/index';

const TOKEN = 'test-key';
const PACK_ID = 1040985;

const MANIFEST = {
  minecraft: {
    version: '1.20.1',
    modLoaders: [{ id: 'forge-47.4.20', primary: true }],
  },
  name: 'Test Pack',
  version: '1.2.3',
  files: [{ projectID: 238222, fileID: 100, required: true }],
  overrides: 'overrides',
};

const PACK = zipSync({
  'manifest.json': strToU8(JSON.stringify(MANIFEST)),
  'overrides/config/a.toml': strToU8('a = 1'),
});

const file = (id: number, fileName: string, downloadUrl: string | null) => ({
  id,
  modId: id + 1_000_000,
  fileName,
  fileLength: 4096,
  hashes: [{ value: 'a'.repeat(40), algo: 1 }],
  downloadUrl,
});

/** Stands in for CurseForge's API and its CDN. */
let server: Server;
let base: string;
let requests: { target: string; key?: string; fileIds?: number[] }[];

beforeEach(async () => {
  requests = [];
  server = createServer((req, res) => {
    const target = req.url ?? '';
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const key = req.headers['x-api-key'];
      const fileIds: number[] | undefined = raw
        ? JSON.parse(raw).fileIds
        : undefined;
      requests.push({
        target,
        key: typeof key === 'string' ? key : undefined,
        fileIds,
      });
      if (target === '/cdn/pack.zip') {
        res.writeHead(200).end(PACK);
        return;
      }
      const known = [
        file(200, 'botania.jar', null),
        file(100, 'jei.jar', 'https://edge.forgecdn.test/jei.jar'),
        file(PACK_ID, 'pack.zip', `${base}/cdn/pack.zip`),
      ];
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          data: known.filter((f) => fileIds?.includes(f.id)),
        }),
      );
    });
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

describe('CURSEFORGE_API', () => {
  it('comes from the crate rather than being restated here', () => {
    expect(CURSEFORGE_API).toBe('https://api.curseforge.com/v1');
  });
});

describe('parseFileRef', () => {
  it('reads a number as itself and a URL for its /files/<id>', () => {
    expect(parseFileRef(6307712)).toBe(6307712);
    expect(
      parseFileRef(
        'https://www.curseforge.com/minecraft/mc-mods/botania/files/2283837',
      ),
    ).toBe(2283837);
    expect(() => parseFileRef('botania')).toThrow(/does not contain/);
  });
});

describe('fetchCurseforgeFiles', () => {
  it('returns files in the API’s order, with the key sent and a CDN fallback', async () => {
    const files = await fetchCurseforgeFiles(TOKEN, [100, 200], base);

    expect(files.map((f) => f.fileId)).toEqual([200, 100]);
    expect(files[0]!.url).toBe(
      'https://edge.forgecdn.net/files/0/200/botania.jar',
    );
    expect(requests).toEqual([
      { target: '/mods/files', key: TOKEN, fileIds: [100, 200] },
    ]);
  });
});

describe('resolveCurseforge', () => {
  it('asks the author where each file goes, once each and in order', async () => {
    const seen: CurseForgeFileInfo[] = [];
    const artifacts = await resolveCurseforge(
      {
        token: TOKEN,
        apiBase: base,
        path: (info) => {
          seen.push(info);
          return `\${game_directory}/mods/${info.filename}`;
        },
      },
      [100, 'https://www.curseforge.com/minecraft/mc-mods/botania/files/200'],
    );

    // Exactly the four documented fields — not the URL or the hash.
    expect(seen).toEqual([
      { filename: 'jei.jar', fileId: 100, projectId: 1_000_100, size: 4096 },
      {
        filename: 'botania.jar',
        fileId: 200,
        projectId: 1_000_200,
        size: 4096,
      },
    ]);
    expect(artifacts[0]).toEqual({
      path: '${game_directory}/mods/jei.jar',
      source: { url: 'https://edge.forgecdn.test/jei.jar' },
      size: 4096,
      integrity: { sha1: 'a'.repeat(40) },
    });
    expect(artifacts[1]!.path).toBe('${game_directory}/mods/botania.jar');
  });

  it('rejects with the crate’s error for a file the API does not know', async () => {
    await expect(
      resolveCurseforge(
        { token: TOKEN, apiBase: base, path: (i) => i.filename },
        [999],
      ),
    ).rejects.toThrow(/did not return metadata for file 999/);
  });
});

describe('curseforge()', () => {
  it('is pure to construct, then logs a count and contributes artifacts', async () => {
    const plugin = curseforge({
      token: TOKEN,
      apiBase: base,
      path: (i) => `mods/${i.filename}`,
      files: [100],
    });
    expect(plugin.name).toBe('curseforge');
    expect(requests).toEqual([]);

    const { ctx, logs } = makeCtx();
    const contribution = await plugin.build(ctx);
    expect(logs).toEqual([{ scope: 'curseforge', message: '1 file(s)' }]);
    expect(contribution.artifacts!.map((a) => a.path)).toEqual([
      'mods/jei.jar',
    ]);
  });
});

describe('loaderSpecFromManifest', () => {
  it('maps the primary loader and throws the crate’s error for Quilt', () => {
    expect(loaderSpecFromManifest(MANIFEST)).toEqual({
      loader: 'forge',
      version: '1.20.1-47.4.20',
    });
    expect(() =>
      loaderSpecFromManifest({
        ...MANIFEST,
        minecraft: { version: '1.20.1', modLoaders: [{ id: 'quilt-0.26.0' }] },
      }),
    ).toThrow(/Quilt/);
  });
});

describe('resolveCurseforgeModpack', () => {
  it('returns the manifest, the mods, the overrides and the loader', async () => {
    const pack = await resolveCurseforgeModpack(
      { token: TOKEN, apiBase: base },
      PACK_ID,
    );

    expect(pack.manifest.name).toBe('Test Pack');
    expect(pack.loader).toEqual({ loader: 'forge', version: '1.20.1-47.4.20' });
    expect(pack.files.map((f) => f.path)).toEqual([
      '${game_directory}/mods/jei.jar',
    ]);
    expect(pack.overrides.path).toBe('${root}/cache/curseforge-modpack.zip');
    expect(pack.overrides.size).toBe(PACK.length);
    expect(requests.map((r) => r.target)).toEqual([
      '/mods/files',
      '/cdn/pack.zip',
      '/mods/files',
    ]);
    // The key reaches the API and not the CDN.
    expect(requests.map((r) => r.key)).toEqual([TOKEN, undefined, TOKEN]);
  });
});

describe('curseforgeModpack()', () => {
  it('builds the loader the pack asks for and layers the pack over it', async () => {
    const specs: LoaderSpec[] = [];
    const plugin = curseforgeModpack({
      token: TOKEN,
      apiBase: base,
      file: `https://www.curseforge.com/minecraft/modpacks/x/files/${PACK_ID}`,
      loader: (spec) => {
        specs.push(spec);
        return definePlugin({
          name: `fake-${spec.loader}`,
          build: () => ({
            artifacts: [
              {
                path: '${version_dir}/client.jar',
                source: { url: 'https://x/c' },
              },
            ],
            vars: { classpath: 'cp' },
            launch: {
              command: 'java',
              jvmArgs: [],
              mainClass: 'net.harmoniya.horno.Main',
              gameArgs: [],
            },
            envs: { JAVA_HOME: '/jdk' },
          }),
        });
      },
    });
    expect(plugin.name).toBe('curseforgeModpack');

    const { ctx, logs } = makeCtx();
    const contribution = await plugin.build(ctx);

    expect(specs).toEqual([{ loader: 'forge', version: '1.20.1-47.4.20' }]);
    // Loader first, then the pack's mods, then the overrides archive.
    expect(contribution.artifacts!.map((a) => a.path)).toEqual([
      '${version_dir}/client.jar',
      '${game_directory}/mods/jei.jar',
      '${root}/cache/curseforge-modpack.zip',
    ]);
    expect(contribution.vars).toEqual({ classpath: 'cp' });
    expect(contribution.launch).toEqual({
      command: 'java',
      jvmArgs: [],
      mainClass: 'net.harmoniya.horno.Main',
      gameArgs: [],
    });
    expect(contribution.envs).toEqual({ JAVA_HOME: '/jdk' });
    expect(logs).toEqual([
      {
        scope: 'curseforgeModpack',
        message: 'Test Pack — fake-forge + 1 file(s)',
      },
    ]);
  });
});
