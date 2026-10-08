/**
 * The JS half of `@opys/cleanroom`: the typed surface and the plugin closure.
 *
 * Loader behaviour — resolving a release, reading its document, the classpath
 * order — is the `opys-cleanroom` crate's, and is tested there against the
 * same kind of local stand-in server. What is left here is what only exists
 * on this side: that each wrapper reaches the right native call, that a value
 * handed back across the boundary is still usable, and that the plugin logs
 * and returns the contribution it gets back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BuildContext } from '@opys/dev';
import { valValues } from '@opys/core';
import {
  cleanroom,
  resolveCleanroom,
  resolveCleanroomVersion,
  DEFAULT_CLEANROOM_INDEX,
} from '../../lib/index';

const SHA = (c: string) => c.repeat(40);
const MC = '1.12.2';
const TAG = '0.6.13-alpha';
const FOUNDATION = 'top.outlands.foundation.boot.Foundation';
const JAR = `com/cleanroommc/cleanroom/${TAG}/cleanroom-${TAG}.jar`;

/** A Cleanroom document: a complete version JSON, inheriting from nothing. */
const document = (base: string) => ({
  id: `1.12.2-Cleanroom-${TAG}`,
  type: 'release',
  time: '2026-09-12T13:22:40+00:00',
  releaseTime: '2026-09-12T13:22:40+00:00',
  minimumLauncherVersion: 18,
  assets: '1.12',
  complianceLevel: 1,
  javaVersion: { component: 'java-runtime-epsilon', majorVersion: 25 },
  mainClass: FOUNDATION,
  assetIndex: {
    id: '1.12',
    sha1: SHA('c'),
    size: 1,
    totalSize: 2,
    url: `${base}/assets/1.12.json`,
  },
  downloads: {
    client: { sha1: SHA('d'), size: 3, url: 'https://example.invalid/c.jar' },
  },
  minecraftArguments: '--username ${auth_player_name} --tweakClass fml.Tweaker',
  libraries: [
    {
      name: `com.cleanroommc:cleanroom:${TAG}`,
      downloads: {
        artifact: {
          path: JAR,
          sha1: SHA('a'),
          size: 2000,
          url: `https://example.invalid/cleanroom-${TAG}-universal.jar`,
        },
      },
    },
  ],
});

const ASSET_MANIFEST = {
  objects: { 'pack.mcmeta': { hash: '0f00', size: 2 } },
};

/** Stands in for the document index, the document and its asset index. */
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
  const documentUrl = `${base}/versions/${MC}/${TAG}.json`;
  if (target === '/index.json')
    return {
      versions: {
        [MC]: {
          latest: TAG,
          latestUrl: documentUrl,
          recommended: TAG,
          recommendedUrl: documentUrl,
          best: TAG,
          bestUrl: documentUrl,
          builds: [{ build: TAG, url: documentUrl }],
        },
      },
    };
  if (target === `/versions/${MC}/${TAG}.json`) return document(base);
  if (target === '/assets/1.12.json') return ASSET_MANIFEST;
  return undefined;
}

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

const options = () => ({ version: MC, source: base });

function makeCtx() {
  const logs: { scope: string; message: string }[] = [];
  const ctx: BuildContext = {
    log: (scope, message) => logs.push({ scope, message }),
    configDir: '/tmp',
    mode: '',
  };
  return { ctx, logs };
}

describe('DEFAULT_CLEANROOM_INDEX', () => {
  it('comes from the crate rather than being restated here', () => {
    expect(DEFAULT_CLEANROOM_INDEX).toBe(
      'https://harmoniya-net.github.io/metadata/cleanroom',
    );
  });
});

describe('resolveCleanroomVersion', () => {
  it('resolves a bare Minecraft version to its best release', async () => {
    const r = await resolveCleanroomVersion(MC, base);
    expect(r).toEqual({
      minecraft: MC,
      cleanroom: TAG,
      documentUrl: `${base}/versions/${MC}/${TAG}.json`,
    });
    expect(targets).toEqual(['/index.json']);
  });

  it('resolves a release tag, which names no Minecraft version', async () => {
    const r = await resolveCleanroomVersion(TAG, base);
    expect(r.minecraft).toBe(MC);
    expect(r.cleanroom).toBe(TAG);
  });

  it('rejects a version the index does not list, naming it', async () => {
    await expect(resolveCleanroomVersion('9.9.9', base)).rejects.toThrow(
      /9\.9\.9/,
    );
  });
});

describe('resolveCleanroom', () => {
  it('returns artifacts, vars, classpath and the decomposed launch', async () => {
    const t = await resolveCleanroom(options());

    expect(valValues(t.mainClass)).toEqual([FOUNDATION]);
    expect(t.launch.command).toBe('${java_bin}');
    expect(t.artifacts.map((a) => a.path)).toContain(
      `\${library_directory}/${JAR}`,
    );
  });

  it('hands back values the manifest types can read directly', async () => {
    const t = await resolveCleanroom(options());

    expect(t.gameArgs.flatMap(valValues)).toEqual([
      '--username',
      '${auth_player_name}',
      '--tweakClass',
      'fml.Tweaker',
    ]);
    const jar = t.artifacts.find((a) => a.path.endsWith(JAR))!;
    expect(jar.integrity).toEqual({ sha1: SHA('a') });
  });

  it('walks the index, then the document, then its assets — and no Mojang chain', async () => {
    await resolveCleanroom(options());
    expect(targets).toEqual([
      '/index.json',
      `/versions/${MC}/${TAG}.json`,
      '/assets/1.12.json',
    ]);
  });

  it('surfaces a failed fetch as a rejection naming the status', async () => {
    await expect(
      resolveCleanroom({ ...options(), source: `${base}/nope` }),
    ).rejects.toThrow(/returned HTTP 404/);
  });
});

describe('cleanroom()', () => {
  it('is pure to construct', () => {
    const plugin = cleanroom({ version: MC });
    expect(plugin.name).toBe('cleanroom');
    expect(targets).toEqual([]);
  });

  it('logs the version and contributes artifacts, vars and launch groups', async () => {
    const { ctx, logs } = makeCtx();
    const contribution = await cleanroom(options()).build(ctx);

    expect(logs).toEqual([{ scope: 'cleanroom', message: `resolved ${MC}` }]);
    expect(contribution.artifacts!.length).toBeGreaterThan(0);
    expect(Object.keys(contribution.launch!).sort()).toEqual([
      'command',
      'gameArgs',
      'jvmArgs',
      'mainClass',
    ]);
  });
});
