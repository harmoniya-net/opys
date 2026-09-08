/**
 * The JS half of `@opys/fabric`: the typed surface and the plugin closure.
 *
 * Loader behaviour — picking a build, the profile fold, the appended
 * classpath, the merged args — is the `opys-fabric` crate's, and is tested
 * there against the same kind of local stand-in server. What is left here is
 * what only exists on this side: that each wrapper reaches the right native
 * call, that a value handed back across the boundary is still usable, and that
 * the plugin logs and returns the contribution it gets back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BuildContext } from '@opys/dev';
import { valValues } from '@opys/core';
import {
  fabric,
  resolveFabric,
  resolveFabricVersion,
  DEFAULT_FABRIC_META,
} from '../../lib/index';

const SHA = (c: string) => c.repeat(40);
const MC = '1.20.1';
const LOADER = '0.16.10';
const KNOT = 'net.fabricmc.loader.impl.launch.knot.KnotClient';

const versionJson = (base: string) => ({
  id: MC,
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

const PROFILE = {
  id: `fabric-loader-${LOADER}-${MC}`,
  inheritsFrom: MC,
  mainClass: KNOT,
  arguments: {
    game: [],
    jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '],
  },
  libraries: [
    {
      name: `net.fabricmc:fabric-loader:${LOADER}`,
      url: 'https://maven.fabricmc.net/',
      sha1: SHA('a'),
      size: 2000,
    },
    {
      name: 'net.fabricmc:intermediary:1.20.1',
      url: 'https://maven.fabricmc.net/',
    },
  ],
};

const ASSET_MANIFEST = {
  objects: { 'pack.mcmeta': { hash: '0f00', size: 2 } },
};

/** Stands in for both Fabric Meta and the Mojang endpoints. */
let server: Server;
let base: string;
let targets: string[];

beforeEach(async () => {
  targets = [];
  server = createServer((req, res) => {
    const target = req.url ?? '';
    targets.push(target);
    const body = route(target);
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

/** Anything off the routes below 404s, so a misspelled base is visible. */
function route(target: string): unknown {
  if (target === `/v2/versions/loader/${MC}/${LOADER}/profile/json`)
    return PROFILE;
  if (target === `/v2/versions/loader/${MC}`)
    return [{ loader: { version: LOADER, stable: true } }];
  if (target === `/versions/${MC}.json`) return versionJson(base);
  if (target === '/assets/5.json') return ASSET_MANIFEST;
  if (target === '/manifest.json')
    return {
      latest: { release: MC, snapshot: MC },
      versions: [
        {
          id: MC,
          type: 'release',
          url: `${base}/versions/${MC}.json`,
          time: '2023-06-12T00:00:00+00:00',
          releaseTime: '2023-06-12T00:00:00+00:00',
          sha1: SHA('a'),
          complianceLevel: 1,
        },
      ],
    };
  return undefined;
}

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

const options = (loader?: string) => ({
  version: MC,
  loader,
  source: base,
  manifestBase: `${base}/manifest.json`,
});

function makeCtx() {
  const logs: { scope: string; message: string }[] = [];
  const ctx: BuildContext = {
    log: (scope, message) => logs.push({ scope, message }),
    configDir: '/tmp',
    mode: '',
  };
  return { ctx, logs };
}

describe('DEFAULT_FABRIC_META', () => {
  it('comes from the crate rather than being restated here', () => {
    expect(DEFAULT_FABRIC_META).toBe('https://meta.fabricmc.net');
  });
});

describe('resolveFabricVersion', () => {
  it('builds the profile URL for a pinned loader without asking Meta', async () => {
    const r = await resolveFabricVersion(MC, base, LOADER);
    expect(r).toEqual({
      gameVersion: MC,
      loaderVersion: LOADER,
      profileUrl: `${base}/v2/versions/loader/${MC}/${LOADER}/profile/json`,
    });
    expect(targets).toEqual([]);
  });

  it('asks Meta for the newest stable build when none is pinned', async () => {
    const r = await resolveFabricVersion(MC, base);
    expect(r.loaderVersion).toBe(LOADER);
    expect(targets).toEqual([`/v2/versions/loader/${MC}`]);
  });
});

describe('resolveFabric', () => {
  it('returns artifacts, vars, classpath and the decomposed launch', async () => {
    const t = await resolveFabric(options(LOADER));

    expect(valValues(t.mainClass)).toEqual([KNOT]);
    expect(t.launch.command).toBe('${java_bin}');
    expect(t.classpath).toHaveLength(3);
    expect(t.vars.version_name).toBe(MC);
    expect(t.artifacts.map((a) => a.path)).toContain(
      `\${library_directory}/net/fabricmc/fabric-loader/${LOADER}/fabric-loader-${LOADER}.jar`,
    );
  });

  it('hands back values the manifest types can read directly', async () => {
    const t = await resolveFabric(options(LOADER));

    const jvm = t.jvmArgs.flatMap(valValues);
    expect(jvm).toEqual([
      '-Xmx2G',
      '-DFabricMcEmu= net.minecraft.client.main.Main ',
    ]);
    const loaderJar = t.artifacts.find((a) =>
      a.path.includes('fabric-loader'),
    )!;
    expect(loaderJar.source).toEqual({
      url: `https://maven.fabricmc.net/net/fabricmc/fabric-loader/${LOADER}/fabric-loader-${LOADER}.jar`,
    });
    expect(loaderJar.integrity).toEqual({ sha1: SHA('a') });
  });

  it('walks Meta then the Mojang chain', async () => {
    await resolveFabric(options());
    expect(targets).toEqual([
      `/v2/versions/loader/${MC}`,
      `/v2/versions/loader/${MC}/${LOADER}/profile/json`,
      '/manifest.json',
      `/versions/${MC}.json`,
      '/assets/5.json',
    ]);
  });

  it('surfaces a failed fetch as a rejection naming the status', async () => {
    await expect(
      resolveFabric({ ...options(LOADER), source: `${base}/nope` }),
    ).rejects.toThrow(/returned HTTP 404/);
  });
});

describe('fabric()', () => {
  it('is pure to construct', () => {
    const plugin = fabric(MC);
    expect(plugin.name).toBe('fabric');
    expect(targets).toEqual([]);
  });

  it('logs the version and contributes artifacts, vars and launch groups', async () => {
    const { ctx, logs } = makeCtx();
    const contribution = await fabric(MC, options(LOADER)).build(ctx);

    expect(logs).toEqual([{ scope: 'fabric', message: `resolved ${MC}` }]);
    expect(contribution.vars!.version_name).toBe(MC);
    expect(contribution.artifacts!.length).toBeGreaterThan(0);
    expect(Object.keys(contribution.launch!).sort()).toEqual([
      'command',
      'gameArgs',
      'jvmArgs',
      'mainClass',
    ]);
  });
});
