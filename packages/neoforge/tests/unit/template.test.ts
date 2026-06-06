import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { resolveNeoForge } from '../../lib/template';

afterEach(() => vi.unstubAllGlobals());

const SOURCE = 'https://neoforge.test/releases';
const NF_VERSION = '20.4.80-beta';
const MC_VERSION = '1.20.4';

const VERSION_MANIFEST = {
  latest: { release: MC_VERSION, snapshot: MC_VERSION },
  versions: [
    {
      id: MC_VERSION,
      type: 'release',
      url: `https://meta/${MC_VERSION}.json`,
      time: '2024-01-01T00:00:00+00:00',
      releaseTime: '2024-01-01T00:00:00+00:00',
      sha1: 'a'.repeat(40),
      complianceLevel: 1,
    },
  ],
};

function clientJson(id = MC_VERSION, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'release',
    time: '2024-01-01T00:00:00+00:00',
    releaseTime: '2024-01-01T00:00:00+00:00',
    minimumLauncherVersion: 21,
    assets: '5',
    complianceLevel: 1,
    mainClass: 'net.minecraft.client.main.Main',
    javaVersion: { component: 'java-runtime-gamma', majorVersion: 21 },
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
    ...overrides,
  };
}

const ASSET_MANIFEST = {
  objects: {
    'minecraft/sounds/click.ogg': { hash: 'ab'.repeat(20), size: 100 },
  },
};

function lib(name: string, path: string, url = `https://maven/${path}`) {
  return {
    name,
    downloads: {
      artifact: { path, url, sha1: 'd'.repeat(40), size: 1000 },
    },
  };
}

function makeInstallerZip(
  versionJson: unknown,
  installProfile: unknown,
): Uint8Array {
  return zipSync({
    'version.json': strToU8(JSON.stringify(versionJson)),
    'install_profile.json': strToU8(JSON.stringify(installProfile)),
  });
}

function routedFetch(routes: Array<[match: string, body: unknown]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      for (const [match, body] of routes) {
        if (url.includes(match)) {
          if (body instanceof Response) return body.clone();
          if (body instanceof Uint8Array) return new Response(body);
          if (typeof body === 'string') return new Response(body);
          return new Response(JSON.stringify(body));
        }
      }
      return new Response(`unrouted: ${url}`, { status: 404 });
    }),
  );
}

function baseVersionJson(overrides: Record<string, unknown> = {}) {
  return {
    id: `${MC_VERSION}-neoforge-${NF_VERSION}`,
    inheritsFrom: MC_VERSION,
    mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
    arguments: {
      game: ['--fml.neoForgeVersion', NF_VERSION],
      jvm: ['-DlibraryDirectory=${library_directory}'],
    },
    libraries: [
      lib(
        `net.neoforged:neoforge:${NF_VERSION}:universal`,
        `net/neoforged/neoforge/${NF_VERSION}/neoforge-${NF_VERSION}-universal.jar`,
        '',
      ),
      lib(
        'cpw.mods:bootstraplauncher:2.1.3',
        'cpw/mods/bootstraplauncher/2.1.3/bootstraplauncher-2.1.3.jar',
        'https://maven/bootstraplauncher.jar',
      ),
    ],
    ...overrides,
  };
}

function baseInstallProfile() {
  return {
    spec: 1,
    profile: 'NeoForge',
    version: `${MC_VERSION}-neoforge-${NF_VERSION}`,
    minecraft: MC_VERSION,
    libraries: [
      lib(
        `net.neoforged:neoforge:${NF_VERSION}:installer`,
        `net/neoforged/neoforge/${NF_VERSION}/neoforge-${NF_VERSION}-installer.jar`,
        `https://maven.neoforged.net/releases/net/neoforged/neoforge/${NF_VERSION}/neoforge-${NF_VERSION}-installer.jar`,
      ),
    ],
  };
}

function vanillaRoutes(): Array<[string, unknown]> {
  return [
    ['version_manifest', VERSION_MANIFEST],
    [`/${MC_VERSION}.json`, clientJson()],
    ['/assets/5.json', ASSET_MANIFEST],
  ];
}

describe('resolveNeoForge', () => {
  it('builds a template with vanilla + NeoForge artifacts and launch groups', async () => {
    const zip = makeInstallerZip(baseVersionJson(), baseInstallProfile());
    routedFetch([
      [`neoforge-${NF_VERSION}-installer.jar.sha1`, 'abc123'],
      [`neoforge-${NF_VERSION}-installer.jar`, zip],
      ...vanillaRoutes(),
    ]);

    const t = await resolveNeoForge({ version: NF_VERSION, source: SOURCE });

    expect(t.artifacts.length).toBeGreaterThan(0);
    expect(t.mainClass).toBeDefined();
    expect(t.jvmArgs).toBeDefined();
    expect(t.gameArgs).toBeDefined();
    expect(t.launch.command).toBe('${java_bin}');
  });

  it('places the installer artifact at the correct library path with sha1 integrity', async () => {
    const zip = makeInstallerZip(baseVersionJson(), baseInstallProfile());
    routedFetch([
      [`neoforge-${NF_VERSION}-installer.jar.sha1`, 'deadbeef'],
      [`neoforge-${NF_VERSION}-installer.jar`, zip],
      ...vanillaRoutes(),
    ]);

    const t = await resolveNeoForge({ version: NF_VERSION, source: SOURCE });

    // The installer artifact is uniquely identified by its extract directive.
    const installer = t.artifacts.find((a) => a.extract !== undefined);
    expect(installer).toBeDefined();
    expect(installer!.path).toBe(
      `\${library_directory}/net/neoforged/neoforge/${NF_VERSION}/neoforge-${NF_VERSION}-installer.jar`,
    );
    expect(installer!.integrity).toEqual({ sha1: 'deadbeef' });
    expect(installer!.extract).toBeDefined();
  });

  it('omits integrity when sha1 fetch fails', async () => {
    const zip = makeInstallerZip(baseVersionJson(), baseInstallProfile());
    routedFetch([
      [
        `neoforge-${NF_VERSION}-installer.jar.sha1`,
        new Response('err', { status: 404 }),
      ],
      [`neoforge-${NF_VERSION}-installer.jar`, zip],
      ...vanillaRoutes(),
    ]);

    const t = await resolveNeoForge({ version: NF_VERSION, source: SOURCE });

    const installer = t.artifacts.find((a) => a.extract !== undefined);
    expect(installer!.integrity).toBeUndefined();
  });

  it('deduplicates classpath by Maven coords when NeoForge re-lists vanilla libs at same version', async () => {
    // NeoForge version.json often re-lists vanilla libs (gson, guava, etc.).
    // Dedup by groupId:artifactId so no path appears twice.
    const vj = baseVersionJson({
      libraries: [
        lib(
          'com.google.code.gson:gson:2.10.1',
          'com/google/code/gson/gson/2.10.1/gson-2.10.1.jar',
          'https://maven/gson.jar',
        ), // same coord+path as in vanilla clientJson()
        lib(
          'cpw.mods:bootstraplauncher:2.1.3',
          'cpw/mods/bootstraplauncher/2.1.3/bootstraplauncher-2.1.3.jar',
          'https://maven/bootstraplauncher.jar',
        ),
      ],
    });
    const zip = makeInstallerZip(vj, baseInstallProfile());
    routedFetch([
      [`neoforge-${NF_VERSION}-installer.jar.sha1`, 'abc'],
      [`neoforge-${NF_VERSION}-installer.jar`, zip],
      ...vanillaRoutes(),
    ]);

    const t = await resolveNeoForge({ version: NF_VERSION, source: SOURCE });

    const gsonPath =
      '${library_directory}/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar';
    const classpathArms = t.vars.classpath as unknown as { value: string }[];
    for (const arm of classpathArms) {
      const count = arm.value
        .split('${classpath_separator}')
        .filter((e) => e === gsonPath).length;
      expect(count).toBe(1);
    }
  });

  it('deduplicates classpath by Maven coords when NeoForge upgrades a vanilla lib', async () => {
    // NeoForge may ship a newer gson (2.11.0) while vanilla ships 2.10.1.
    // Vanilla's 2.10.1 must be excluded; NeoForge's 2.11.0 must appear exactly once.
    const vj = baseVersionJson({
      libraries: [
        lib(
          'com.google.code.gson:gson:2.11.0', // upgraded version
          'com/google/code/gson/gson/2.11.0/gson-2.11.0.jar',
          'https://maven/gson-new.jar',
        ),
        lib(
          'cpw.mods:bootstraplauncher:2.1.3',
          'cpw/mods/bootstraplauncher/2.1.3/bootstraplauncher-2.1.3.jar',
          'https://maven/bootstraplauncher.jar',
        ),
      ],
    });
    const zip = makeInstallerZip(vj, baseInstallProfile());
    routedFetch([
      [`neoforge-${NF_VERSION}-installer.jar.sha1`, 'abc'],
      [`neoforge-${NF_VERSION}-installer.jar`, zip],
      ...vanillaRoutes(),
    ]);

    const t = await resolveNeoForge({ version: NF_VERSION, source: SOURCE });

    const classpathArms = t.vars.classpath as unknown as { value: string }[];
    for (const arm of classpathArms) {
      const entries = arm.value.split('${classpath_separator}');
      // Old version must not appear
      expect(entries.some((e) => e.includes('gson-2.10.1'))).toBe(false);
      // New version must appear exactly once
      const newCount = entries.filter((e) => e.includes('gson-2.11.0')).length;
      expect(newCount).toBe(1);
    }
  });

  it('excludes empty-URL libs from the download set', async () => {
    const zip = makeInstallerZip(baseVersionJson(), baseInstallProfile());
    routedFetch([
      [`neoforge-${NF_VERSION}-installer.jar.sha1`, 'abc'],
      [`neoforge-${NF_VERSION}-installer.jar`, zip],
      ...vanillaRoutes(),
    ]);

    const t = await resolveNeoForge({ version: NF_VERSION, source: SOURCE });

    // The neoforge universal lib has url:"" — it must not appear as a separate artifact
    const hasEmptyUrlArtifact = t.artifacts.some(
      (a) =>
        'source' in a &&
        typeof a.source === 'object' &&
        a.source !== null &&
        'url' in a.source &&
        (a.source as { url: string }).url === '',
    );
    expect(hasEmptyUrlArtifact).toBe(false);
  });

  it('merges NeoForge game args after vanilla args', async () => {
    const zip = makeInstallerZip(baseVersionJson(), baseInstallProfile());
    routedFetch([
      [`neoforge-${NF_VERSION}-installer.jar.sha1`, 'abc'],
      [`neoforge-${NF_VERSION}-installer.jar`, zip],
      ...vanillaRoutes(),
    ]);

    const t = await resolveNeoForge({ version: NF_VERSION, source: SOURCE });

    // Valset is Val[] — flatten all value arrays into one list of strings.
    const gameArgs = t.gameArgs.flatMap((v) => v.value);
    const vanillaIdx = gameArgs.findIndex((a) => a === '--username');
    const nfIdx = gameArgs.findIndex((a) => a === '--fml.neoForgeVersion');
    expect(vanillaIdx).toBeGreaterThanOrEqual(0);
    expect(nfIdx).toBeGreaterThan(vanillaIdx);
  });

  it('rewrites ../libraries/ paths in JVM args to ${library_directory}', async () => {
    const vj = baseVersionJson({
      arguments: {
        game: [],
        jvm: ['../libraries/some/lib.jar'],
      },
    });
    const zip = makeInstallerZip(vj, baseInstallProfile());
    routedFetch([
      [`neoforge-${NF_VERSION}-installer.jar.sha1`, 'abc'],
      [`neoforge-${NF_VERSION}-installer.jar`, zip],
      ...vanillaRoutes(),
    ]);

    const t = await resolveNeoForge({ version: NF_VERSION, source: SOURCE });

    const jvmArgs = t.jvmArgs.flatMap((v) => v.value);
    expect(jvmArgs.some((a) => a.includes('../libraries/'))).toBe(false);
    expect(jvmArgs.some((a) => a.includes('${library_directory}'))).toBe(true);
  });

  it('throws when the installer download fails', async () => {
    routedFetch([
      [`neoforge-${NF_VERSION}-installer.jar.sha1`, 'abc'],
      [
        `neoforge-${NF_VERSION}-installer.jar`,
        new Response('gone', { status: 404 }),
      ],
    ]);

    await expect(
      resolveNeoForge({ version: NF_VERSION, source: SOURCE }),
    ).rejects.toThrow(/Failed to download NeoForge installer/);
  });

  it('throws when version.json is missing from the installer zip', async () => {
    const zip = zipSync({
      'install_profile.json': strToU8(JSON.stringify(baseInstallProfile())),
    });
    routedFetch([
      [`neoforge-${NF_VERSION}-installer.jar.sha1`, 'abc'],
      [`neoforge-${NF_VERSION}-installer.jar`, zip],
      ...vanillaRoutes(),
    ]);

    await expect(
      resolveNeoForge({ version: NF_VERSION, source: SOURCE }),
    ).rejects.toThrow(/missing entry 'version\.json'/);
  });

  it('throws when install_profile.json is missing from the installer zip', async () => {
    const zip = zipSync({
      'version.json': strToU8(JSON.stringify(baseVersionJson())),
    });
    routedFetch([
      [`neoforge-${NF_VERSION}-installer.jar.sha1`, 'abc'],
      [`neoforge-${NF_VERSION}-installer.jar`, zip],
      ...vanillaRoutes(),
    ]);

    await expect(
      resolveNeoForge({ version: NF_VERSION, source: SOURCE }),
    ).rejects.toThrow(/missing entry 'install_profile\.json'/);
  });
});
