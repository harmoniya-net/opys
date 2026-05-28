/**
 * Shared Mojang-shaped fixtures + a fetch-routing helper for the
 * network-driven template/plugin tests.
 */
import { vi } from 'vitest';

export const VERSION_MANIFEST = {
  latest: { release: '1.20.1', snapshot: '1.20.1' },
  versions: [
    {
      id: '1.20.1',
      type: 'release',
      url: 'https://meta/1.20.1.json',
      time: '2023-06-12T00:00:00+00:00',
      releaseTime: '2023-06-12T00:00:00+00:00',
      sha1: 'a'.repeat(40),
      complianceLevel: 1,
    },
    {
      id: '1.12.2',
      type: 'release',
      url: 'https://meta/1.12.2.json',
      time: '2017-09-18T00:00:00+00:00',
      releaseTime: '2017-09-18T00:00:00+00:00',
      sha1: 'b'.repeat(40),
      complianceLevel: 0,
    },
    {
      id: '1.7.10',
      type: 'release',
      url: 'https://meta/1.7.10.json',
      time: '2014-06-26T00:00:00+00:00',
      releaseTime: '2014-06-26T00:00:00+00:00',
      sha1: 'c'.repeat(40),
      complianceLevel: 0,
    },
  ],
};

/** A library entry in Mojang's `downloads.artifact` shape. */
export function lib(
  name: string,
  path: string,
  url = `https://libraries.minecraft.net/${path}`,
) {
  return {
    name,
    downloads: {
      artifact: {
        path,
        url,
        sha1: 'd'.repeat(40),
        size: 1000,
      },
    },
  };
}

/** A minimal but schema-valid vanilla client JSON (modern `arguments` form). */
export function clientJson(
  id = '1.20.1',
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
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
      lib(
        'com.google.code.gson:gson:2.10.1',
        'com/google/code/gson/gson/2.10.1/gson-2.10.1.jar',
      ),
    ],
    ...overrides,
  };
}

export const ASSET_MANIFEST = {
  objects: {
    'minecraft/sounds/click.ogg': { hash: 'ab'.repeat(20), size: 100 },
  },
};

/**
 * Build a fetch mock that dispatches by URL substring. Each route value is
 * serialized to JSON; pass a `Response` directly to control status.
 */
export function routedFetch(
  routes: Array<[match: string, body: unknown]>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string) => {
    for (const [match, body] of routes) {
      if (url.includes(match)) {
        return body instanceof Response
          ? body.clone()
          : new Response(JSON.stringify(body));
      }
    }
    return new Response(`unrouted: ${url}`, { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Standard vanilla routes: manifest + client JSON + asset manifest. */
export function vanillaRoutes(id = '1.20.1'): Array<[string, unknown]> {
  return [
    ['version_manifest', VERSION_MANIFEST],
    [`/${id}.json`, clientJson(id)],
    ['/assets/5.json', ASSET_MANIFEST],
  ];
}
