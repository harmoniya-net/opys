/**
 * The JS half of `@opys/java`: the typed surface and the plugin closure.
 *
 * Resolver behaviour — version shapes, anchoring, asset matching, the
 * template — is the `opys-java` crate's, and is tested there against the same
 * kind of local stand-in server. What is left to check here is what only
 * exists on this side: that each wrapper reaches the right native call, and
 * that the plugin logs and returns the contribution it gets back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BuildContext } from '@opys/dev';
import {
  java,
  resolveJava,
  resolveTemurin,
  resolveZulu,
  resolveGraalvm,
  DEFAULT_PLATFORMS,
  type Platform,
} from '../../lib/index';

const LINUX_X64: Platform = { os: 'linux', arch: 'x86_64' };

const TEMURIN_BODY = JSON.stringify([
  {
    release_name: 'jdk-21.0.11+10',
    version_data: { major: 21 },
    binaries: [
      {
        architecture: 'x64',
        os: 'linux',
        image_type: 'jdk',
        jvm_impl: 'hotspot',
        package: {
          checksum: 'abc123',
          link: 'https://example.invalid/a.tar.gz',
          name: 'a.tar.gz',
          size: 12345,
        },
      },
    ],
  },
]);

const ZULU_BODY = JSON.stringify([
  {
    name: 'z.tar.gz',
    download_url: 'https://example.invalid/z.tar.gz',
    size: 2,
    sha256_hash: 'def456',
    java_version: [21, 0, 5],
    distro_version: [21, 38, 21],
  },
]);

const GRAALVM_BODY = JSON.stringify([
  {
    tag_name: 'jdk-21.0.2',
    prerelease: false,
    draft: false,
    assets: [
      {
        name: 'g_linux-x64_bin.tar.gz',
        size: 3,
        browser_download_url: 'https://example.invalid/g.tar.gz',
        digest: 'sha256:ghi789',
      },
    ],
  },
]);

/** Answers whichever vendor endpoint is asked for, and records the paths. */
let server: Server;
let base: string;
let targets: string[];

beforeEach(async () => {
  targets = [];
  server = createServer((req, res) => {
    const target = req.url ?? '';
    targets.push(target);
    const body = target.startsWith('/assets/')
      ? TEMURIN_BODY
      : target.startsWith('/zulu/packages/')
        ? ZULU_BODY
        : target.startsWith('/repos/')
          ? GRAALVM_BODY
          : null;
    if (body === null) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(body);
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

describe('DEFAULT_PLATFORMS', () => {
  it('comes from the crate and covers three OSes across two arches', () => {
    expect(DEFAULT_PLATFORMS).toHaveLength(6);
    expect(
      [...DEFAULT_PLATFORMS].map((p) => `${p.os}/${p.arch}`).sort(),
    ).toEqual([
      'linux/aarch64',
      'linux/x86_64',
      'osx/aarch64',
      'osx/x86_64',
      'windows/aarch64',
      'windows/x86_64',
    ]);
  });
});

describe('resolveJava', () => {
  it('returns artifacts, vars and the resolved release', async () => {
    const template = await resolveJava({
      version: '21',
      platforms: [LINUX_X64],
      apiBase: base,
    });

    expect(template.release.label).toBe('Temurin 21.0.11+10');
    expect(template.release.major).toBe(21);
    expect(template.artifacts).toHaveLength(1);
    expect(template.artifacts[0]!.source).toHaveProperty('url');
    expect(Object.keys(template.vars).sort()).toEqual([
      'java_bin',
      'java_home',
      'java_runtime_dir',
    ]);
  });

  it('dispatches on vendor', async () => {
    const zulu = await resolveJava({
      version: '21',
      vendor: 'zulu',
      platforms: [LINUX_X64],
      apiBase: base,
    });
    expect(zulu.release.label).toBe('Zulu 21.38.21 (JDK 21.0.5)');

    const graalvm = await resolveJava({
      version: '21',
      vendor: 'graalvm',
      platforms: [LINUX_X64],
      apiBase: base,
    });
    expect(graalvm.release.label).toBe('GraalVM CE 21.0.2');
  });

  it('rejects when no platform yields a binary', async () => {
    await expect(
      resolveJava({
        version: '99',
        platforms: [LINUX_X64],
        apiBase: `${base}/nope`,
      }),
    ).rejects.toThrow(/No Temurin binaries found for version '99'/);
  });
});

describe('per-vendor resolvers', () => {
  it('resolveTemurin reaches the Adoptium endpoint', async () => {
    const release = await resolveTemurin('21', {
      platforms: [LINUX_X64],
      apiBase: base,
    });
    expect(release.label).toBe('Temurin 21.0.11+10');
    expect(release.binaries[0]!.sha256).toBe('abc123');
    expect(targets[0]).toMatch(/^\/assets\/feature_releases\/21\/ga\?/);
  });

  it('resolveZulu reaches the Azul endpoint', async () => {
    const release = await resolveZulu('21', {
      platforms: [LINUX_X64],
      apiBase: base,
    });
    expect(release.label).toBe('Zulu 21.38.21 (JDK 21.0.5)');
    expect(targets[0]).toMatch(/^\/zulu\/packages\/\?/);
  });

  it('resolveGraalvm reaches the GitHub releases endpoint', async () => {
    const release = await resolveGraalvm('21', {
      platforms: [LINUX_X64],
      apiBase: base,
    });
    expect(release.label).toBe('GraalVM CE 21.0.2');
    expect(targets[0]).toBe(
      '/repos/graalvm/graalvm-ce-builds/releases?per_page=100',
    );
  });
});

describe('java', () => {
  it('returns a plugin named "java"', () => {
    const plugin = java('21');
    expect(plugin.name).toBe('java');
    expect(typeof plugin.build).toBe('function');
  });

  it('does no I/O at construction time', () => {
    // No server needed: constructing must not touch the network.
    expect(() => java('21')).not.toThrow();
    expect(targets).toHaveLength(0);
  });

  it('builds artifacts, vars, a launch group and JAVA_HOME', async () => {
    const { ctx } = makeCtx();
    const contribution = await java('21', {
      platforms: [LINUX_X64],
      apiBase: base,
    }).build(ctx);

    expect(contribution.artifacts).toHaveLength(1);
    expect(contribution.vars?.java_runtime_dir).toBe('${root}/runtimes');
    expect(contribution.launch).toEqual({ bin: '${java_bin}' });
    expect(contribution.envs).toEqual({ JAVA_HOME: '${java_home}' });
  });

  it('logs the resolved release label', async () => {
    const { ctx, logs } = makeCtx();
    await java('21', { platforms: [LINUX_X64], apiBase: base }).build(ctx);
    expect(logs).toEqual([{ scope: 'java', message: 'Temurin 21.0.11+10' }]);
  });

  it('forwards options through to the resolver', async () => {
    const { ctx } = makeCtx();
    await java('21', {
      vendor: 'zulu',
      platforms: [LINUX_X64],
      apiBase: base,
    }).build(ctx);
    expect(targets[0]).toMatch(/^\/zulu\/packages\/\?/);
  });

  it('propagates a resolver failure out of build', async () => {
    const { ctx } = makeCtx();
    await expect(
      java('21', { platforms: [LINUX_X64], apiBase: `${base}/nope` }).build(
        ctx,
      ),
    ).rejects.toThrow(/No Temurin binaries found/);
  });
});
