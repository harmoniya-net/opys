/**
 * The JS half of `@opys/forge`: the typed surface and the plugin closure.
 *
 * Loader behaviour — resolving a build, the document fold, the classpath
 * order, the merged args — is the `opys-forge` crate's, and is tested there
 * against the same kind of local stand-in server. What is left here is what
 * only exists on this side: that each wrapper reaches the right native call,
 * that a value handed back across the boundary is still usable, and that the
 * plugin logs and returns the contribution it gets back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BuildContext } from '@opys/dev';
import { valValues } from '@opys/core';
import {
  forge,
  resolveForge,
  resolveForgeVersion,
  DEFAULT_FORGE_INDEX,
} from '../../lib/index';

const SHA = (c: string) => c.repeat(40);
const MC = '1.20.1';
const BUILD = '1.20.1-47.4.10';
const WRAPPER_MAIN = 'io.github.zekerzhayard.forgewrapper.installer.Main';

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

const DOCUMENT = {
  id: `${MC}-forge-47.4.10`,
  inheritsFrom: MC,
  mainClass: WRAPPER_MAIN,
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
          sha1: SHA('a'),
          size: 2000,
          url: 'https://example.invalid/sjh.jar',
        },
      },
    },
  ],
};

const ASSET_MANIFEST = {
  objects: { 'pack.mcmeta': { hash: '0f00', size: 2 } },
};

/** Stands in for the document index, the documents and the Mojang endpoints. */
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
  const documentUrl = `${base}/versions/${MC}/${BUILD}.json`;
  if (target === '/index.json')
    return {
      versions: {
        [MC]: {
          latest: BUILD,
          latestUrl: documentUrl,
          recommended: BUILD,
          recommendedUrl: documentUrl,
          best: BUILD,
          bestUrl: documentUrl,
          builds: [{ forge: BUILD, url: documentUrl }],
        },
      },
    };
  if (target === `/versions/${MC}/${BUILD}.json`) return DOCUMENT;
  if (target === `/mojang/${MC}.json`) return versionJson(base);
  if (target === '/assets/5.json') return ASSET_MANIFEST;
  if (target === '/manifest.json')
    return {
      latest: { release: MC, snapshot: MC },
      versions: [
        {
          id: MC,
          type: 'release',
          url: `${base}/mojang/${MC}.json`,
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

const options = () => ({
  version: MC,
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

describe('DEFAULT_FORGE_INDEX', () => {
  it('comes from the crate rather than being restated here', () => {
    expect(DEFAULT_FORGE_INDEX).toBe(
      'https://harmoniya-net.github.io/ForgeWrapper',
    );
  });
});

describe('resolveForgeVersion', () => {
  it('resolves a bare Minecraft version to its best build', async () => {
    const r = await resolveForgeVersion(MC, base);
    expect(r).toEqual({
      minecraft: MC,
      forge: BUILD,
      documentUrl: `${base}/versions/${MC}/${BUILD}.json`,
    });
    expect(targets).toEqual(['/index.json']);
  });

  it('rejects a version the index does not list, naming it', async () => {
    await expect(resolveForgeVersion('9.9.9', base)).rejects.toThrow(/9\.9\.9/);
  });
});

describe('resolveForge', () => {
  it('returns artifacts, vars, classpath and the decomposed launch', async () => {
    const t = await resolveForge(options());

    expect(valValues(t.mainClass)).toEqual([WRAPPER_MAIN]);
    expect(t.launch.command).toBe('${java_bin}');
    expect(t.classpath).toHaveLength(3);
    expect(t.artifacts.map((a) => a.path)).toContain(
      '${library_directory}/cpw/mods/securejarhandler/2.1.10/securejarhandler-2.1.10.jar',
    );
  });

  it('hands back values the manifest types can read directly', async () => {
    const t = await resolveForge(options());

    expect(t.jvmArgs.flatMap(valValues)).toEqual([
      '-Xmx2G',
      '-Dforgewrapper.librariesDir=${library_directory}',
    ]);
    expect(t.gameArgs.flatMap(valValues)).toEqual([
      '--demo',
      '--launchTarget',
      'forgeclient',
    ]);
    const sjh = t.artifacts.find((a) => a.path.includes('securejarhandler'))!;
    expect(sjh.integrity).toEqual({ sha1: SHA('a') });
  });

  it('walks the index, then the document, then the Mojang chain', async () => {
    await resolveForge(options());
    expect(targets).toEqual([
      '/index.json',
      `/versions/${MC}/${BUILD}.json`,
      '/manifest.json',
      `/mojang/${MC}.json`,
      '/assets/5.json',
    ]);
  });

  it('surfaces a failed fetch as a rejection naming the status', async () => {
    await expect(
      resolveForge({ ...options(), source: `${base}/nope` }),
    ).rejects.toThrow(/returned HTTP 404/);
  });
});

describe('forge()', () => {
  it('is pure to construct', () => {
    const plugin = forge(MC);
    expect(plugin.name).toBe('forge');
    expect(targets).toEqual([]);
  });

  it('logs the version and contributes artifacts, vars and launch groups', async () => {
    const { ctx, logs } = makeCtx();
    const contribution = await forge(MC, options()).build(ctx);

    expect(logs).toEqual([{ scope: 'forge', message: `resolved ${MC}` }]);
    expect(contribution.artifacts!.length).toBeGreaterThan(0);
    expect(Object.keys(contribution.launch!).sort()).toEqual([
      'command',
      'gameArgs',
      'jvmArgs',
      'mainClass',
    ]);
  });
});
