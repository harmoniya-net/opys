import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  blobBytes,
  blobFile,
  blobId,
  options,
  writeBundle,
  type Blobs,
} from '@opys/bundle';
import type { Manifest } from '@opys/core';
import {
  buildLaunch,
  currentPlatform,
  install,
  prepare,
  readHead,
  type InstallProgress,
} from '../../lib';

const text = (s: string) => new TextEncoder().encode(s);
const tmp = (name: string) => mkdtempSync(join(tmpdir(), `opys-napi-${name}-`));

/** A manifest that puts `hello.txt` under `root`, and the blob it is made of. */
function hello(root: string): { manifest: Manifest; blobs: Blobs } {
  const id = blobId(text('world'));
  return {
    manifest: {
      vars: { root },
      launch: {
        command: 'java',
        workdir: '${root}',
        args: ['-jar', '${root}/hello.txt'],
        envs: {},
      },
      artifacts: [{ path: '${root}/hello.txt', source: { blob: id } }],
    },
    blobs: { [id]: blobBytes(text('world')) },
  };
}

describe('@opys/runtime — napi boundary smoke', () => {
  test('currentPlatform reports a non-empty name', () => {
    expect(currentPlatform().name.length).toBeGreaterThan(0);
  });

  /** `manifest` and its blobs as a bundle on disk: what a blob installs from. */
  const bundled = async (manifest: Manifest, blobs: Blobs) => {
    const bundle = join(tmp('bundle'), 'game.opys');
    await writeBundle(bundle, manifest, blobs);
    return { bundle };
  };

  test('install copies a blob out of a bundle and emits phase events', async () => {
    const dir = tmp('rt');
    const events: string[] = [];
    const { manifest, blobs } = hello(dir);
    await install(await bundled(manifest, blobs), {
      verifyIntegrity: true,
      onProgress: (p: InstallProgress) => events.push(p.phase),
    });
    expect(readFileSync(join(dir, 'hello.txt'), 'utf8')).toBe('world');
    expect(events).toContain('resolve');
    expect(events).toContain('verify');
    expect(events).toContain('download:done');
    // Everything the install sent has arrived by the time it resolves, and
    // the marker that says so is the wrapper's own.
    expect(events.at(-1)).toBe('verify');
    expect(events).not.toContain('end');
  });

  test('a bundle carries a blob that was a file on the building machine', async () => {
    const dir = tmp('file');
    const built = join(dir, 'built.txt');
    writeFileSync(built, 'world');
    const { manifest } = hello(join(dir, 'game'));
    await install(
      await bundled(manifest, { [blobId(text('world'))]: blobFile(built) }),
    );
    expect(readFileSync(join(dir, 'game/hello.txt'), 'utf8')).toBe('world');
  });

  test('a manifest in memory cannot name a blob: it came in no bundle', async () => {
    const { manifest } = hello(tmp('missing'));
    await expect(install({ manifest })).rejects.toThrow(/nothing holds it/);
  });

  test('a source that is none of the three shapes is refused', async () => {
    await expect(
      install({ vars: {}, artifacts: [] } as never),
    ).rejects.toThrow();
  });

  test('install skips an artifact whose target already exists', async () => {
    const dir = tmp('skip');
    writeFileSync(join(dir, 'exists.txt'), 'prior');
    await install({
      manifest: {
        vars: { root: dir },
        // No integrity, so nothing to hold the present file against — and
        // nothing listens here, so fetching it would fail.
        artifacts: [
          {
            path: '${root}/exists.txt',
            source: { url: 'http://127.0.0.1:1/fresh' },
          },
        ],
      },
    });
    expect(readFileSync(join(dir, 'exists.txt'), 'utf8')).toBe('prior');
  });

  test('buildLaunch interpolates command/workdir/args', async () => {
    const spec = await buildLaunch({
      manifest: {
        vars: { root: '/srv', jvm: '/opt/jdk/bin/java' },
        launch: {
          command: '${jvm}',
          workdir: '${root}',
          args: ['-Xmx2G', '-jar', '${root}/app.jar'],
          envs: {},
        },
        artifacts: [],
      },
    });
    expect(spec.command).toBe('/opt/jdk/bin/java');
    expect(spec.workdir).toBe('/srv');
    expect(spec.args).toEqual(['-Xmx2G', '-jar', '/srv/app.jar']);
  });

  test('buildLaunch picks os-allowed args via rules', async () => {
    const spec = await buildLaunch(
      {
        manifest: {
          vars: {},
          launch: {
            command: 'java',
            workdir: '.',
            args: [
              '-Xmx1G',
              { value: '-XstartOnFirstThread', rules: 'allow.os.osx' },
              { value: '--linux-only', rules: 'allow.os.linux' },
            ],
            envs: {},
          },
          artifacts: [],
        },
      },
      { platform: { name: 'linux', version: '', arch: 'x86_64' } },
    );
    expect(spec.args).toContain('-Xmx1G');
    expect(spec.args).toContain('--linux-only');
    expect(spec.args).not.toContain('-XstartOnFirstThread');
  });

  test('a failed install still settles, with its events delivered', async () => {
    const dir = tmp('rt-fail');
    const events: string[] = [];
    const { manifest, blobs } = hello(dir);
    const escaping = {
      ...manifest,
      artifacts: [{ ...manifest.artifacts[0]!, path: '${root}/../out.txt' }],
    };
    await expect(
      install(await bundled(escaping, blobs), {
        onProgress: (p: InstallProgress) => events.push(p.phase),
      }),
    ).rejects.toMatchObject({ code: 'manifest' });
    expect(events).toEqual(['resolve']);
  });

  test('a source the binding refuses outright rejects without waiting', async () => {
    await expect(
      install({ nowhere: true } as never, { onProgress: () => {} }),
    ).rejects.toThrow();
  });

  test('buildLaunch reads a bundle and takes var overrides', async () => {
    const dir = tmp('launch');
    const { manifest, blobs } = hello('/built/here');
    const bundle = join(dir, 'game.opys');
    await writeBundle(bundle, manifest, blobs);
    const spec = await buildLaunch({ bundle }, { vars: { root: '/srv/game' } });
    expect(spec.workdir).toBe('/srv/game');
    expect(spec.args).toEqual(['-jar', '/srv/game/hello.txt']);
  });

  test('prepare installs and returns what to spawn, in one call', async () => {
    const dir = tmp('prepare');
    const { manifest, blobs } = hello('/built/here');
    const bundle = join(dir, 'game.opys');
    await writeBundle(bundle, manifest, blobs);
    const root = join(dir, 'game');
    const events: string[] = [];
    const spec = await prepare(
      { bundle },
      { vars: { root }, install: { onProgress: (p) => events.push(p.phase) } },
    );
    expect(readFileSync(join(root, 'hello.txt'), 'utf8')).toBe('world');
    // Interpolated, not built as a path: the manifest's `/` is kept.
    expect(spec.args).toEqual(['-jar', `${root}/hello.txt`]);
    expect(events).toContain('download:done');
  });

  test('prepare with install off installs nothing', async () => {
    const dir = tmp('noinstall');
    const { manifest, blobs } = hello(dir);
    const spec = await prepare(await bundled(manifest, blobs), {
      install: false,
    });
    expect(spec.command).toBe('java');
    expect(() => readFileSync(join(dir, 'hello.txt'))).toThrow();
  });

  describe('readHead', () => {
    const form = options().feature('fullscreen').title('Fullscreen');
    const written = async () => {
      const { manifest, blobs } = hello(tmp('head-root'));
      const bundle = join(tmp('head'), 'game.opys');
      await writeBundle(bundle, manifest, blobs, { options: form });
      return { bundle, manifest };
    };
    const head = {
      format: 1,
      options: [{ feature: 'fullscreen', title: 'Fullscreen' }],
    };

    test('gives the options of a bundle on disk', async () => {
      const { bundle } = await written();
      expect(await readHead({ bundle })).toEqual(head);
    });

    test('asks a URL for the front of the file alone', async () => {
      const { bundle } = await written();
      const ranges: (string | undefined)[] = [];
      const server = createServer((req, res) => {
        ranges.push(req.headers.range);
        res.end(readFileSync(bundle));
      });
      await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
      try {
        const { port } = server.address() as AddressInfo;
        const url = `http://127.0.0.1:${port}/game.opys`;
        expect(await readHead({ url })).toEqual(head);
        expect(ranges).toEqual(['bytes=0-16383']);
      } finally {
        server.close();
      }
    });

    test('a manifest in memory is in no bundle and has no head', async () => {
      const { manifest } = await written();
      expect(await readHead({ manifest: { ...manifest, artifacts: [] } })).toBe(
        undefined,
      );
    });

    test('a file that is not a bundle is a manifest error', async () => {
      const file = join(tmp('not'), 'game.opys');
      writeFileSync(file, 'not a zip');
      await expect(readHead({ bundle: file })).rejects.toMatchObject({
        code: 'manifest',
      });
    });
  });
});
