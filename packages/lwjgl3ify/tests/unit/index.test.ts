/**
 * The JS half of `@opys/lwjgl3ify`: the typed surface and the plugin closure.
 *
 * Loader behaviour — resolving a release, reading its document, choosing the
 * mod jars — is the `opys-lwjgl3ify` crate's, and is tested there against the
 * same kind of local stand-in server. What is left here is what only exists
 * on this side: that each wrapper reaches the right native call, that the
 * options survive the crossing (`unimixins: false` in particular, which is
 * not an object), and that the plugin logs and returns what it gets back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BuildContext } from '@opys/dev';
import { valValues } from '@opys/core';
import {
  lwjgl3ify,
  resolveLwjgl3ify,
  resolveLwjgl3ifyVersion,
  DEFAULT_LWJGL3IFY_INDEX,
} from '../../lib/index';

const SHA = (c: string) => c.repeat(40);
const MC = '1.7.10';
const TAG = '3.0.37';
const RFB = 'com.gtnewhorizons.retrofuturabootstrap.MainStartOnFirstThread';
const PATCHES = `com/github/GTNewHorizons/lwjgl3ify/${TAG}/lwjgl3ify-${TAG}-forgePatches.jar`;

/** An lwjgl3ify document: a complete version JSON, inheriting from nothing. */
const document = (base: string) => ({
  id: `1.7.10-lwjgl3ify-${TAG}`,
  type: 'release',
  time: '2026-10-04T12:05:03+03:00',
  releaseTime: '2026-10-04T12:05:03+03:00',
  minimumLauncherVersion: 21,
  assets: '1.7.10',
  complianceLevel: 0,
  javaVersion: { component: 'java-runtime-epsilon', majorVersion: 25 },
  mainClass: RFB,
  assetIndex: {
    id: '1.7.10',
    sha1: SHA('c'),
    size: 1,
    totalSize: 2,
    url: `${base}/assets/1.7.10.json`,
  },
  downloads: {
    client: { sha1: SHA('d'), size: 3, url: 'https://example.invalid/c.jar' },
  },
  arguments: {
    game: ['--username', '${auth_player_name}'],
    jvm: ['-cp', '${classpath}'],
  },
  libraries: [
    {
      name: `com.github.GTNewHorizons:lwjgl3ify:${TAG}:forgePatches`,
      downloads: {
        artifact: {
          path: PATCHES,
          sha1: SHA('a'),
          size: 2000,
          url: 'https://example.invalid/forgePatches.jar',
        },
      },
    },
  ],
});

const asset = (name: string) => ({
  name,
  size: 4242,
  browser_download_url: `https://example.invalid/${name}`,
  digest: `sha256:${'d'.repeat(64)}`,
});

const release = (tag: string, names: string[]) => ({
  tag_name: tag,
  prerelease: false,
  draft: false,
  published_at: '2026-10-04T00:00:00Z',
  assets: names.map(asset),
});

const ASSET_MANIFEST = {
  objects: { 'pack.mcmeta': { hash: '0f00', size: 2 } },
};

/** Stands in for the document index, the document, its assets, and GitHub. */
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
  if (target === '/assets/1.7.10.json') return ASSET_MANIFEST;
  if (target === `/repos/GTNewHorizons/lwjgl3ify/releases/tags/${TAG}`)
    return release(TAG, [`lwjgl3ify-${TAG}-dev.jar`, `lwjgl3ify-${TAG}.jar`]);
  if (target.startsWith('/repos/LegacyModdingMC/UniMixins/releases?'))
    return [release('0.2.1', ['+unimixins-all-1.7.10-0.2.1.jar'])];
  return undefined;
}

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

const options = () => ({ version: MC, source: base, apiBase: base });

function makeCtx() {
  const logs: { scope: string; message: string }[] = [];
  const ctx: BuildContext = {
    log: (scope, message) => logs.push({ scope, message }),
    configDir: '/tmp',
    mode: '',
  };
  return { ctx, logs };
}

describe('DEFAULT_LWJGL3IFY_INDEX', () => {
  it('comes from the crate rather than being restated here', () => {
    expect(DEFAULT_LWJGL3IFY_INDEX).toBe(
      'https://harmoniya-net.github.io/metadata/lwjgl3ify',
    );
  });
});

describe('resolveLwjgl3ifyVersion', () => {
  it('resolves a bare Minecraft version to its best release', async () => {
    const r = await resolveLwjgl3ifyVersion(MC, base);
    expect(r).toEqual({
      minecraft: MC,
      lwjgl3ify: TAG,
      documentUrl: `${base}/versions/${MC}/${TAG}.json`,
    });
    expect(targets).toEqual(['/index.json']);
  });

  it('resolves a release tag, which names no Minecraft version', async () => {
    const r = await resolveLwjgl3ifyVersion(TAG, base);
    expect(r.minecraft).toBe(MC);
    expect(r.lwjgl3ify).toBe(TAG);
  });

  it('rejects a version the index does not list, naming it', async () => {
    await expect(resolveLwjgl3ifyVersion('9.9.9', base)).rejects.toThrow(
      /9\.9\.9/,
    );
  });
});

const modsOf = (t: { artifacts: { path: string }[] }) =>
  t.artifacts
    .map((a) => a.path)
    .filter((p) => p.startsWith('${game_directory}/mods/'))
    .map((p) => p.slice('${game_directory}/mods/'.length));

describe('resolveLwjgl3ify', () => {
  it('returns artifacts, vars, classpath and the decomposed launch', async () => {
    const t = await resolveLwjgl3ify(options());

    expect(valValues(t.mainClass)).toEqual([RFB]);
    expect(t.launch.command).toBe('${java_bin}');
    expect(t.artifacts.map((a) => a.path)).toContain(
      `\${library_directory}/${PATCHES}`,
    );
  });

  it('adds the mod jar and UniMixins under mods/', async () => {
    const t = await resolveLwjgl3ify(options());
    expect(modsOf(t)).toEqual([
      `lwjgl3ify-${TAG}.jar`,
      '+unimixins-all-1.7.10-0.2.1.jar',
    ]);
  });

  it('carries `unimixins: false` across the boundary as an opt-out', async () => {
    const t = await resolveLwjgl3ify({ ...options(), unimixins: false });
    expect(modsOf(t)).toEqual([`lwjgl3ify-${TAG}.jar`]);
    expect(targets.some((u) => u.includes('UniMixins'))).toBe(false);
  });

  it('walks the site, then asks GitHub for the two releases', async () => {
    await resolveLwjgl3ify(options());
    expect(targets).toEqual([
      '/index.json',
      `/versions/${MC}/${TAG}.json`,
      '/assets/1.7.10.json',
      `/repos/GTNewHorizons/lwjgl3ify/releases/tags/${TAG}`,
      '/repos/LegacyModdingMC/UniMixins/releases?per_page=100',
    ]);
  });

  it('surfaces a failed fetch as a rejection naming the status', async () => {
    await expect(
      resolveLwjgl3ify({ ...options(), source: `${base}/nope` }),
    ).rejects.toThrow(/returned HTTP 404/);
  });
});

describe('lwjgl3ify()', () => {
  it('is pure to construct', () => {
    const plugin = lwjgl3ify(MC);
    expect(plugin.name).toBe('lwjgl3ify');
    expect(targets).toEqual([]);
  });

  it('logs the version and contributes artifacts, vars and launch groups', async () => {
    const { ctx, logs } = makeCtx();
    const contribution = await lwjgl3ify(MC, options()).build(ctx);

    expect(logs).toEqual([{ scope: 'lwjgl3ify', message: `resolved ${MC}` }]);
    expect(contribution.artifacts!.length).toBeGreaterThan(0);
    expect(Object.keys(contribution.launch!).sort()).toEqual([
      'command',
      'gameArgs',
      'jvmArgs',
      'mainClass',
    ]);
  });
});
