/**
 * The JS half of `@opys/authliberty`: the typed surface and the plugin closure.
 *
 * Picking the package and the jar, building the URL and the arguments — all
 * of that is the `opys-authliberty` crate's and is tested there. What is left
 * here is what only exists on this side: that each wrapper reaches the right
 * native call, that a `hosts` function is called out into a map before it
 * crosses, and that the plugin logs and returns the contribution it gets back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BuildContext } from '@opys/dev';
import { valValues } from '@opys/core';
import {
  authliberty,
  resolveAuthliberty,
  resolveAuthLibertyVersion,
  type AuthLibertyServer,
} from '../../lib/index';

const JAR =
  '${library_directory}/net/harmoniya/authliberty/0.3/authliberty-0.3.jar';

/** Stands in for GitLab's packages API. */
let server: Server;
let base: string;
let requests: { target: string; token?: string }[];

beforeEach(async () => {
  requests = [];
  server = createServer((req, res) => {
    const target = req.url ?? '';
    const token = req.headers['private-token'];
    requests.push({
      target,
      token: typeof token === 'string' ? token : undefined,
    });
    const body = target.includes('/package_files')
      ? [
          {
            id: 1,
            package_id: 100,
            file_name: 'authliberty-0.3.jar',
            size: 4096,
            file_sha256: 'cafef00d',
            created_at: '2024-01-01T00:00:00Z',
          },
        ]
      : [
          {
            id: 100,
            name: 'authliberty',
            version: '0.3',
            package_type: 'generic',
            status: 'default',
            created_at: '2024-01-01T00:00:00Z',
          },
        ];
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify(body));
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

describe('resolveAuthLibertyVersion', () => {
  it('resolves a version into a release the caller can read', async () => {
    const r = await resolveAuthLibertyVersion('0.3', { gitlab: base });
    expect(r).toEqual({
      version: '0.3',
      filename: 'authliberty-0.3.jar',
      url: `${base}/api/v4/projects/harmoniya%2Fauthliberty/packages/generic/authliberty/0.3/authliberty-0.3.jar`,
      size: 4096,
      sha256: 'cafef00d',
      createdAt: '2024-01-01T00:00:00Z',
    });
  });

  it('passes the token and the project through', async () => {
    await resolveAuthLibertyVersion('0.3', {
      gitlab: base,
      project: 'me/agent',
      token: 'glpat-test',
    });
    expect(requests.every((r) => r.token === 'glpat-test')).toBe(true);
    expect(requests[0]!.target).toContain('/projects/me%2Fagent/');
  });

  it('rejects an unknown version, naming it', async () => {
    await expect(
      resolveAuthLibertyVersion('9.9', { gitlab: base }),
    ).rejects.toThrow(/'9\.9' not found.*Available: 0\.3/);
  });
});

describe('resolveAuthliberty', () => {
  it('returns the jar, the agent argument and the release', async () => {
    const t = await resolveAuthliberty({ version: '0.3', gitlab: base });

    expect(t.artifacts).toHaveLength(1);
    expect(t.artifacts[0]!.path).toBe(JAR);
    expect(t.artifacts[0]!.integrity).toEqual({ sha256: 'cafef00d' });
    expect(t.jvmArgs.flatMap(valValues)).toEqual([`-javaagent:${JAR}`]);
    expect(t.release.version).toBe('0.3');
  });

  it('takes hosts as a map', async () => {
    const t = await resolveAuthliberty({
      version: '0.3',
      gitlab: base,
      hosts: { session: 'https://session.example', auth: '' },
    });
    expect(t.jvmArgs.flatMap(valValues).slice(1)).toEqual([
      '-Dminecraft.api.session.host=https://session.example',
    ]);
  });

  it('calls a hosts function once per server and sends what it returns', async () => {
    const asked: AuthLibertyServer[] = [];
    const t = await resolveAuthliberty({
      version: '0.3',
      gitlab: base,
      hosts: (server) => {
        asked.push(server);
        return server === 'account' ? undefined : `https://${server}.example`;
      },
    });

    expect(asked).toEqual(['auth', 'account', 'session', 'services']);
    expect(t.jvmArgs.flatMap(valValues).slice(1)).toEqual([
      '-Dminecraft.api.auth.host=https://auth.example',
      '-Dminecraft.api.session.host=https://session.example',
      '-Dminecraft.api.services.host=https://services.example',
    ]);
  });
});

describe('authliberty()', () => {
  it('is pure to construct', () => {
    const plugin = authliberty('0.3');
    expect(plugin.name).toBe('authliberty');
    expect(requests).toEqual([]);
  });

  it('logs the version and contributes the jar and a single launch group', async () => {
    const { ctx, logs } = makeCtx();
    const contribution = await authliberty('0.3', { gitlab: base }).build(ctx);

    expect(logs).toEqual([{ scope: 'authliberty', message: 'resolved 0.3' }]);
    expect(contribution.artifacts).toHaveLength(1);
    expect(Object.keys(contribution.launch!)).toEqual(['jvmArgs']);
    expect(contribution.vars).toBeUndefined();
  });
});
