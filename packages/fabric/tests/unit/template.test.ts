import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { valValues } from '@opys/core';
import { resolveFabric } from '../../lib/template';

let mojang: MojangServer;

beforeEach(async () => {
  mojang = await mojangServer();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await mojang.close();
});

const META = 'https://meta.fabric.test';
const MC = '1.20.1';
const LOADER = '0.16.10';

const VERSION_MANIFEST = {
  latest: { release: MC, snapshot: MC },
  versions: [
    {
      id: MC,
      type: 'release',
      url: `https://meta/${MC}.json`,
      time: '2023-06-12T00:00:00+00:00',
      releaseTime: '2023-06-12T00:00:00+00:00',
      sha1: 'a'.repeat(40),
      complianceLevel: 1,
    },
  ],
};

function clientJson() {
  return {
    id: MC,
    type: 'release',
    time: '2023-06-12T00:00:00+00:00',
    releaseTime: '2023-06-12T00:00:00+00:00',
    minimumLauncherVersion: 21,
    assets: '5',
    complianceLevel: 1,
    mainClass: 'net.minecraft.client.main.Main',
    javaVersion: { component: 'java-runtime-gamma', majorVersion: 17 },
    assetIndex: {
      id: '5',
      sha1: 'e'.repeat(40),
      size: 400,
      totalSize: 5000,
      url: 'https://meta/assets/5.json',
    },
    downloads: {
      client: {
        sha1: 'f'.repeat(40),
        size: 25_000_000,
        url: 'https://piston-data/client.jar',
      },
    },
    arguments: {
      game: ['--username', '${auth_player_name}'],
      jvm: ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'],
    },
    libraries: [
      {
        name: 'com.google.code.gson:gson:2.10.1',
        downloads: {
          artifact: {
            path: 'com/google/code/gson/gson/2.10.1/gson-2.10.1.jar',
            url: 'https://libraries/gson.jar',
            sha1: 'd'.repeat(40),
            size: 1000,
          },
        },
      },
    ],
  };
}

const ASSET_MANIFEST = {
  objects: {
    'minecraft/sounds/click.ogg': { hash: 'ab'.repeat(20), size: 100 },
  },
};

function profileJson(overrides: Record<string, unknown> = {}) {
  return {
    id: `fabric-loader-${LOADER}-${MC}`,
    inheritsFrom: MC,
    type: 'release',
    mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
    arguments: {
      game: [],
      jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '],
    },
    libraries: [
      {
        name: `net.fabricmc:fabric-loader:${LOADER}`,
        url: 'https://maven.fabricmc.net/',
        sha1: 'a'.repeat(40),
        size: 2000,
      },
      {
        name: 'net.fabricmc:intermediary:1.20.1',
        url: 'https://maven.fabricmc.net/',
      },
    ],
    ...overrides,
  };
}

function routedFetch(routes: Array<[match: string, body: unknown]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      for (const [match, body] of routes) {
        if (url.includes(match)) {
          return body instanceof Response
            ? body.clone()
            : new Response(JSON.stringify(body));
        }
      }
      return new Response(`unrouted: ${url}`, { status: 404 });
    }),
  );
}

// ──────────────────────────────────────────────────────────────────────────
// The Mojang endpoints, on loopback.
//
// The vanilla client is fetched inside the `opys-minecraft-vanilla` crate now, not
// through `globalThis.fetch`, so a `vi.stubGlobal('fetch', …)` route can no
// longer intercept it. Fabric Meta still goes through `fetchWithRetry` and
// keeps the stub — only the Mojang half needs a real socket.
// ──────────────────────────────────────────────────────────────────────────

interface MojangServer {
  /** Pass as the resolver's `manifestBase`. */
  manifestBase: string;
  close: () => Promise<void>;
}

/**
 * Serve the version manifest, the version JSON and the asset manifest, with
 * every URL they point at rewritten to this server so nothing escapes to the
 * real Mojang.
 */
async function mojangServer(): Promise<MojangServer> {
  let base = '';
  const server = createServer((req, res) => {
    const target = req.url ?? '';
    const client = clientJson();
    const body = target.startsWith('/versions/')
      ? {
          ...client,
          assetIndex: { ...client.assetIndex, url: `${base}/assets/5.json` },
        }
      : target.startsWith('/assets/')
        ? ASSET_MANIFEST
        : {
            ...VERSION_MANIFEST,
            versions: VERSION_MANIFEST.versions.map((v) => ({
              ...v,
              url: `${base}/versions/${v.id}.json`,
            })),
          };
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify(body));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    manifestBase: `${base}/version_manifest_v2.json`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('resolveFabric', () => {
  it('builds a template with vanilla + Fabric artifacts and launch groups', async () => {
    routedFetch([['/profile/json', profileJson()]]);

    const t = await resolveFabric({
      version: MC,
      loader: LOADER,
      source: META,
      manifestBase: mojang.manifestBase,
    });

    expect(t.artifacts.length).toBeGreaterThan(0);
    expect(valValues(t.mainClass)[0]).toBe(
      'net.fabricmc.loader.impl.launch.knot.KnotClient',
    );
    expect(t.launch.command).toBe('${java_bin}');
  });

  it('maps Fabric libraries to library_directory paths with maven layout', async () => {
    routedFetch([['/profile/json', profileJson()]]);

    const t = await resolveFabric({
      version: MC,
      loader: LOADER,
      source: META,
      manifestBase: mojang.manifestBase,
    });

    const loaderArtifact = t.artifacts.find((a) =>
      a.path.includes(`net/fabricmc/fabric-loader/${LOADER}`),
    );
    expect(loaderArtifact).toBeDefined();
    expect(loaderArtifact!.path).toBe(
      `\${library_directory}/net/fabricmc/fabric-loader/${LOADER}/fabric-loader-${LOADER}.jar`,
    );
    expect(loaderArtifact!.integrity).toEqual({ sha1: 'a'.repeat(40) });
    expect(loaderArtifact!.size).toBe(2000);
  });

  it('omits integrity and size when the profile library has no hash', async () => {
    routedFetch([['/profile/json', profileJson()]]);

    const t = await resolveFabric({
      version: MC,
      loader: LOADER,
      source: META,
      manifestBase: mojang.manifestBase,
    });

    const intermediary = t.artifacts.find((a) =>
      a.path.includes('net/fabricmc/intermediary'),
    );
    expect(intermediary).toBeDefined();
    expect(intermediary!.integrity).toBeUndefined();
    expect(intermediary!.size).toBeUndefined();
  });

  it('builds a download URL from the library repo base and maven path', async () => {
    routedFetch([['/profile/json', profileJson()]]);

    const t = await resolveFabric({
      version: MC,
      loader: LOADER,
      source: META,
      manifestBase: mojang.manifestBase,
    });

    const loaderArtifact = t.artifacts.find((a) =>
      a.path.includes(`net/fabricmc/fabric-loader/${LOADER}`),
    )!;
    expect(loaderArtifact.source).toEqual({
      url: `https://maven.fabricmc.net/net/fabricmc/fabric-loader/${LOADER}/fabric-loader-${LOADER}.jar`,
    });
  });

  it('appends Fabric libs onto the per-OS classpath and merges jvm args', async () => {
    routedFetch([['/profile/json', profileJson()]]);

    const t = await resolveFabric({
      version: MC,
      loader: LOADER,
      source: META,
      manifestBase: mojang.manifestBase,
    });

    const cp = t.vars.classpath;
    const arms = Array.isArray(cp) ? cp : [];
    expect(arms.length).toBeGreaterThan(0);
    for (const arm of arms) {
      const value =
        typeof arm === 'string' ? arm : (arm as { value: string }).value;
      expect(value).toContain(`net/fabricmc/fabric-loader/${LOADER}`);
    }
    // The Fabric JVM arg is merged after the vanilla ones.
    const jvmValues = t.jvmArgs.flatMap(valValues);
    expect(jvmValues).toContain(
      '-DFabricMcEmu= net.minecraft.client.main.Main ',
    );
  });

  it('resolves the latest stable loader when none is pinned', async () => {
    routedFetch([
      ['/profile/json', profileJson()],
      [
        `/v2/versions/loader/${MC}`,
        [
          { loader: { version: '0.16.11', stable: false } },
          { loader: { version: LOADER, stable: true } },
        ],
      ],
    ]);

    const t = await resolveFabric({
      version: MC,
      source: META,
      manifestBase: mojang.manifestBase,
    });
    expect(t.artifacts.length).toBeGreaterThan(0);
  });

  it('throws when the profile fetch fails', async () => {
    routedFetch([['/profile/json', new Response('nope', { status: 404 })]]);

    await expect(
      resolveFabric({
        version: MC,
        loader: LOADER,
        source: META,
        manifestBase: mojang.manifestBase,
      }),
    ).rejects.toThrow(/Failed to download Fabric profile/);
  });
});
