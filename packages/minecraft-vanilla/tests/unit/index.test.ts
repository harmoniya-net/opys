/**
 * The JS half of `@opys/minecraft-vanilla`: the typed surface and the plugin
 * closure.
 *
 * Mapper behaviour — the classpath arms, the natives dump rule, the placeholder
 * probes, the launch order — is the `opys-minecraft-vanilla` crate's, and is tested
 * there against the same kind of local stand-in server. What is left to check
 * here is what only exists on this side: that each wrapper reaches the right
 * native call, that a value handed back across the boundary is still usable,
 * and that the plugin logs and returns the contribution it gets back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BuildContext } from '@opys/dev';
import { valValues } from '@opys/core';
import type { Client } from '@opys/mojang';
import {
  minecraft,
  resolveMinecraft,
  fetchClient,
  clientToTemplate,
  fetchVersionManifest,
  fetchAssetManifest,
  mapClientToTemplate,
  mapClientJar,
  mapLibraries,
  libraryToArtifact,
  mapAssetIndex,
  mapAssetObjects,
  buildClasspath,
  buildLaunch,
  VERSION_MANIFEST_URL,
} from '../../lib/index';

const SHA = (c: string) => c.repeat(40);

const versionJson = (id: string, base: string) => ({
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
    sha1: SHA('c'),
    size: 1,
    totalSize: 2,
    url: `${base}/assets/5.json`,
  },
  downloads: {
    client: { sha1: SHA('d'), size: 3, url: 'https://example.invalid/c.jar' },
  },
  libraries: [
    {
      name: 'com.google.code.gson:gson:2.10.1',
      downloads: {
        artifact: {
          path: 'com/google/code/gson/gson/2.10.1/gson-2.10.1.jar',
          sha1: SHA('e'),
          size: 250,
          url: 'https://example.invalid/gson.jar',
        },
      },
    },
  ],
  arguments: { game: ['--demo'], jvm: ['-Xmx2G'] },
});

const ASSET_MANIFEST = {
  objects: { 'pack.mcmeta': { hash: '0f00', size: 2 } },
};

/** Stands in for the Mojang endpoints, and records what was asked for. */
let server: Server;
let base: string;
let targets: string[];

beforeEach(async () => {
  targets = [];
  server = createServer((req, res) => {
    const target = req.url ?? '';
    targets.push(target);
    const body = target.startsWith('/versions/')
      ? versionJson(
          target.slice('/versions/'.length).replace(/\.json$/, ''),
          base,
        )
      : target.startsWith('/assets/')
        ? ASSET_MANIFEST
        : {
            latest: { release: '1.20.1', snapshot: '23w31a' },
            versions: [
              {
                id: '1.20.1',
                type: 'release',
                url: `${base}/versions/1.20.1.json`,
                time: '2023-06-12T00:00:00+00:00',
                releaseTime: '2023-06-12T00:00:00+00:00',
                sha1: SHA('a'),
                complianceLevel: 1,
              },
            ],
          };
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

const manifestBase = () => `${base}/manifest.json`;

function makeCtx() {
  const logs: { scope: string; message: string }[] = [];
  const ctx: BuildContext = {
    log: (scope, message) => logs.push({ scope, message }),
    configDir: '/tmp',
    mode: '',
  };
  return { ctx, logs };
}

describe('VERSION_MANIFEST_URL', () => {
  it('is re-exported from @opys/mojang, not restated', () => {
    expect(VERSION_MANIFEST_URL).toBe(
      'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json',
    );
  });
});

describe('resolveMinecraft', () => {
  it('returns artifacts, vars and the decomposed launch', async () => {
    const t = await resolveMinecraft({
      version: '1.20.1',
      manifestBase: manifestBase(),
    });

    expect(t.artifacts.map((a) => a.path)).toEqual([
      '${version_dir}/client.jar',
      '${library_directory}/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar',
      '${assets_root}/indexes/5.json',
      '${assets_root}/objects/0f/0f00',
    ]);
    expect(t.vars.version_name).toBe('1.20.1');
    expect(t.classpath).toHaveLength(3);
    expect(t.launch.command).toBe('${java_bin}');
    expect(valValues(t.mainClass)).toEqual(['net.minecraft.client.main.Main']);
    expect(targets).toEqual([
      '/manifest.json',
      '/versions/1.20.1.json',
      '/assets/5.json',
    ]);
  });

  it('takes the current release when no version is given', async () => {
    const t = await resolveMinecraft({ manifestBase: manifestBase() });
    expect(t.vars.version_name).toBe('1.20.1');
  });

  it('reports an unknown version by name', async () => {
    await expect(
      resolveMinecraft({ version: '1.2.3', manifestBase: manifestBase() }),
    ).rejects.toThrow(/1\.2\.3/);
  });
});

describe('fetchClient + clientToTemplate', () => {
  it('hands a Client back across the boundary unchanged', async () => {
    const { version, client } = await fetchClient('1.20.1', {
      manifestBase: manifestBase(),
    });
    expect(version.id).toBe('1.20.1');
    expect(client.mainClass).toBe('net.minecraft.client.main.Main');
    // Natives are flattened on the way in, so the domain `Client` is a
    // different shape from the version JSON — and has to survive the trip
    // back, because that is exactly what every loader does with it.
    const t = await clientToTemplate(client);
    expect(t.vars.version_name).toBe('1.20.1');
    expect(t.artifacts).toHaveLength(4);
  });
});

describe('fetchVersionManifest / fetchAssetManifest', () => {
  it('read the documents at the URLs they are given', async () => {
    const manifest = await fetchVersionManifest(manifestBase());
    expect(manifest.latest.release).toBe('1.20.1');

    const assets = await fetchAssetManifest(`${base}/assets/5.json`);
    expect(assets.objects['pack.mcmeta']).toEqual({ hash: '0f00', size: 2 });
  });

  it('name the URL and the status when the server refuses', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = createServer((_req, res) => res.writeHead(503).end());
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/m.json`;
    await expect(fetchVersionManifest(url)).rejects.toThrow(/503/);
  });
});

describe('mappers', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await fetchClient('1.20.1', {
      manifestBase: manifestBase(),
    }));
  });

  it('mapClientToTemplate is the pure half, and reaches the network not at all', () => {
    const before = targets.length;
    const t = mapClientToTemplate(client, ASSET_MANIFEST);
    expect(targets).toHaveLength(before);
    expect(t.artifacts).toHaveLength(4);
  });

  it('map the client jar, libraries, index and objects', () => {
    expect(mapClientJar(client).path).toBe('${version_dir}/client.jar');
    expect(mapLibraries(client.libraries)).toHaveLength(1);
    expect(libraryToArtifact(client.libraries[0]!).path).toContain('gson');
    expect(mapAssetIndex(client.assetIndex).path).toBe(
      '${assets_root}/indexes/5.json',
    );
    expect(mapAssetObjects(ASSET_MANIFEST).map((a) => a.path)).toEqual([
      '${assets_root}/objects/0f/0f00',
    ]);
  });

  it('buildClasspath takes entries a loader assembled itself', () => {
    const arms = buildClasspath(
      [
        { artifactPath: 'shared.jar' },
        {
          artifactPath: 'linux.jar',
          rules: [{ action: 'allow', os: { name: 'linux' } }],
        },
      ],
      'client.jar',
    );
    expect(arms).toHaveLength(3);
    expect(arms[0]!.value).toContain('linux.jar');
    expect(arms[1]!.value).not.toContain('linux.jar');
  });

  it('buildLaunch orders jvm args, main class, then game args', () => {
    const parts = buildLaunch(
      client.mainClass,
      client.args.game,
      client.args.jvm,
    );
    expect(parts.launch.args.flatMap(valValues)).toEqual([
      '-Xmx2G',
      'net.minecraft.client.main.Main',
      '--demo',
    ]);
  });
});

describe('minecraft()', () => {
  it('is pure to construct', () => {
    const plugin = minecraft('1.20.1');
    expect(plugin.name).toBe('minecraft');
    expect(targets).toEqual([]);
  });

  it('logs the version and contributes artifacts, vars and launch groups', async () => {
    const { ctx, logs } = makeCtx();
    const contribution = await minecraft('1.20.1', {
      manifestBase: manifestBase(),
    }).build(ctx);

    expect(logs).toEqual([{ scope: 'minecraft', message: 'vanilla 1.20.1' }]);
    expect(contribution.artifacts).toHaveLength(4);
    expect(contribution.vars!.version_name).toBe('1.20.1');
    expect(Object.keys(contribution.launch!).sort()).toEqual([
      'command',
      'gameArgs',
      'jvmArgs',
      'mainClass',
    ]);
  });

  it('says "latest" when no version is pinned', async () => {
    const { ctx, logs } = makeCtx();
    await minecraft(undefined, { manifestBase: manifestBase() }).build(ctx);
    expect(logs).toEqual([{ scope: 'minecraft', message: 'vanilla latest' }]);
  });
});
