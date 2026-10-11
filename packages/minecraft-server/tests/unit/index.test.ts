/**
 * The JS half of `@opys/minecraft-server`: the typed surface and the plugin
 * closure.
 *
 * Which files a core resolves to is the `opys-minecraft-server` crate's and
 * is tested there. What is left here is what only exists on this side: that
 * each call reaches the crate, that a path is taken beside the config, and
 * that what the crate made comes back as bytes.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EULA_FEATURE,
  resolveServer,
  server,
  serverBuilds,
  serverVersions,
} from '../../lib';

const ctx = { log: () => {}, configDir: '/tmp', mode: '' };

/** Purpur, as far as these tests ask it. */
let purpur: Server;
let apis: { purpur: string };

beforeAll(async () => {
  const answers: Record<string, unknown> = {
    '/v2/purpur': { versions: ['1.20.6', '1.21.1'] },
    '/v2/purpur/1.21.1': { builds: { all: ['2285', '2329'] } },
    '/v2/purpur/1.21.1/latest': { build: '2329', md5: 'd'.repeat(32) },
  };
  purpur = createServer((req, res) => {
    const answer = answers[req.url ?? ''];
    res.statusCode = answer ? 200 : 404;
    res.end(JSON.stringify(answer ?? {}));
  });
  await new Promise<void>((ready) => purpur.listen(0, '127.0.0.1', ready));
  const { port } = purpur.address() as AddressInfo;
  apis = { purpur: `http://127.0.0.1:${port}` };
});

afterAll(() => purpur.close());

describe('the three questions', () => {
  it('lists a core’s versions and the builds of one, newest first', async () => {
    expect(await serverVersions('purpur', apis)).toEqual(['1.21.1', '1.20.6']);
    expect(await serverBuilds('purpur', '1.21.1', apis)).toEqual([
      '2329',
      '2285',
    ]);
  });

  it('resolves a core to its files and to the core that names them', async () => {
    const resolved = await resolveServer({ purpur: '1.21.1', apis });
    expect(resolved).toEqual({
      pinned: { purpur: '1.21.1', build: '2329' },
      label: 'Purpur 1.21.1 build 2329',
      files: [
        {
          path: '${root}/server.jar',
          source: { url: `${apis.purpur}/v2/purpur/1.21.1/2329/download` },
          integrity: { md5: 'd'.repeat(32) },
        },
      ],
    });
    // What it pinned is itself something to resolve.
    expect(resolved.pinned).toEqual({ purpur: '1.21.1', build: '2329' });
  });

  it('refuses a core it does not know', async () => {
    // @ts-expect-error not a core
    await expect(serverVersions('spigot')).rejects.toThrow(
      'unknown variant `spigot`',
    );
  });
});

describe('server', () => {
  it('is named "server" and does nothing until it is built', () => {
    expect(server({ paper: '1.21.1' }).name).toBe('server');
  });

  it('names the feature that agrees to the EULA', () => {
    expect(EULA_FEATURE).toBe('eula');
  });

  it('carries a jar from beside the config, and the EULA as bytes', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'opys-server-'));
    writeFileSync(join(configDir, 'spigot.jar'), 'a jar');
    const logged: string[] = [];
    const contribution = await server({ jar: 'spigot.jar' }).build({
      ...ctx,
      log: (_scope, message) => logged.push(message),
      configDir,
    });

    expect(logged).toEqual([`a jar from ${join(configDir, 'spigot.jar')}`]);
    expect(contribution.artifacts).toEqual([
      {
        path: '${root}/server.jar',
        source: { file: join(configDir, 'spigot.jar') },
      },
      {
        path: '${root}/eula.txt',
        source: { bytes: Buffer.from('eula=true\n') },
        rules: 'allow.features.eula',
      },
    ]);
    expect(contribution.launch).toEqual({
      command: '${java_bin}',
      jar: { rules: [], value: ['-jar', '${root}/server.jar'] },
      args: 'nogui',
    });
  });

  it('takes an installer from beside the config and starts it through the starter', async () => {
    const contribution = await server({
      installer: 'fork-installer.jar',
    }).build({ ...ctx, configDir: '/packs/mine' });
    const [starter, installer] = contribution.artifacts!;
    expect(starter!.path).toBe('${root}/server.jar');
    expect(installer).toEqual({
      path: '${root}/installer.jar',
      source: { file: '/packs/mine/fork-installer.jar' },
    });
    expect(contribution.launch!.jar).toEqual({
      rules: [],
      value: ['-jar', '${root}/server.jar', '--installer-force'],
    });
  });

  it('refuses a field of another core, from plain JavaScript too', async () => {
    const plugin = server({
      paper: '1.21.1',
      // @ts-expect-error a loader is Fabric's
      loader: '0.19.5',
    });
    await expect(plugin.build(ctx)).rejects.toThrow(
      'server({ loader }) means nothing for Paper',
    );
  });

  it('refuses two cores at once', async () => {
    const two = { paper: '1.21.1', fabric: '1.21.1' };
    // @ts-expect-error a server is one core
    await expect(server(two).build(ctx)).rejects.toThrow(
      'server({ paper, fabric }) names two servers',
    );
  });
});
