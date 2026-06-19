import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFabric } from '../../lib/template';

afterEach(() => vi.unstubAllGlobals());

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

function vanillaRoutes(): Array<[string, unknown]> {
  return [
    ['version_manifest', VERSION_MANIFEST],
    [`/${MC}.json`, clientJson()],
    ['/assets/5.json', ASSET_MANIFEST],
  ];
}

describe('resolveFabric', () => {
  it('builds a template with vanilla + Fabric artifacts and launch groups', async () => {
    routedFetch([['/profile/json', profileJson()], ...vanillaRoutes()]);

    const t = await resolveFabric({
      version: MC,
      loader: LOADER,
      source: META,
    });

    expect(t.artifacts.length).toBeGreaterThan(0);
    expect(t.mainClass.value[0]).toBe(
      'net.fabricmc.loader.impl.launch.knot.KnotClient',
    );
    expect(t.launch.command).toBe('${java_bin}');
  });

  it('maps Fabric libraries to library_directory paths with maven layout', async () => {
    routedFetch([['/profile/json', profileJson()], ...vanillaRoutes()]);

    const t = await resolveFabric({
      version: MC,
      loader: LOADER,
      source: META,
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
    routedFetch([['/profile/json', profileJson()], ...vanillaRoutes()]);

    const t = await resolveFabric({
      version: MC,
      loader: LOADER,
      source: META,
    });

    const intermediary = t.artifacts.find((a) =>
      a.path.includes('net/fabricmc/intermediary'),
    );
    expect(intermediary).toBeDefined();
    expect(intermediary!.integrity).toBeUndefined();
    expect(intermediary!.size).toBeUndefined();
  });

  it('builds a download URL from the library repo base and maven path', async () => {
    routedFetch([['/profile/json', profileJson()], ...vanillaRoutes()]);

    const t = await resolveFabric({
      version: MC,
      loader: LOADER,
      source: META,
    });

    const loaderArtifact = t.artifacts.find((a) =>
      a.path.includes(`net/fabricmc/fabric-loader/${LOADER}`),
    )!;
    expect(loaderArtifact.source).toEqual({
      kind: 'url',
      url: `https://maven.fabricmc.net/net/fabricmc/fabric-loader/${LOADER}/fabric-loader-${LOADER}.jar`,
    });
  });

  it('appends Fabric libs onto the per-OS classpath and merges jvm args', async () => {
    routedFetch([['/profile/json', profileJson()], ...vanillaRoutes()]);

    const t = await resolveFabric({
      version: MC,
      loader: LOADER,
      source: META,
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
    const jvmValues = t.jvmArgs.flatMap((v) => v.value);
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
      ...vanillaRoutes(),
    ]);

    const t = await resolveFabric({ version: MC, source: META });
    expect(t.artifacts.length).toBeGreaterThan(0);
  });

  it('throws when the profile fetch fails', async () => {
    routedFetch([
      ['/profile/json', new Response('nope', { status: 404 })],
      ...vanillaRoutes(),
    ]);

    await expect(
      resolveFabric({ version: MC, loader: LOADER, source: META }),
    ).rejects.toThrow(/Failed to download Fabric profile/);
  });
});
