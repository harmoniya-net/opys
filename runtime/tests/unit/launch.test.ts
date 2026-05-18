import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeManifest } from '@torba/core';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn((..._args: unknown[]) => ({ pid: 1 })),
}));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

const { launch } = await import('../../lib/launch');

const LINUX = { name: 'linux', version: '', arch: 'x86_64' } as const;

beforeEach(() => spawnMock.mockClear());

const baseManifest = (overrides: Record<string, unknown> = {}) =>
  decodeManifest({
    vars: { root: '/srv' },
    launch: {
      command: '${root}/java',
      workdir: '${root}',
      args: ['-jar', 'app.jar'],
      envs: { GAME: '${root}/data' },
    },
    artifacts: [],
    ...overrides,
  });

describe('launch', () => {
  it('spawns the resolved command, args, cwd and env', async () => {
    await launch(baseManifest(), { install: false, platform: LINUX });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args, opts] = spawnMock.mock.calls[0]!;
    expect(command).toBe('/srv/java');
    expect(args).toEqual(['-jar', 'app.jar']);
    expect((opts as { cwd: string }).cwd).toBe('/srv');
    expect((opts as { env: Record<string, string> }).env.GAME).toBe(
      '/srv/data',
    );
    expect((opts as { stdio: string }).stdio).toBe('inherit');
  });

  it('overrides the workdir with options.cwd', async () => {
    await launch(baseManifest(), {
      install: false,
      platform: LINUX,
      cwd: '${root}/elsewhere',
    });
    expect((spawnMock.mock.calls[0]![2] as { cwd: string }).cwd).toBe(
      '/srv/elsewhere',
    );
  });

  it('layers option vars over manifest vars', async () => {
    await launch(baseManifest(), {
      install: false,
      platform: LINUX,
      vars: { root: '/over' },
    });
    expect(spawnMock.mock.calls[0]![0]).toBe('/over/java');
  });

  it('emits debug logs for cwd, cmd and each arg', async () => {
    const logs: string[] = [];
    await launch(baseManifest(), {
      install: false,
      platform: LINUX,
      log: (_lvl, msg) => logs.push(msg),
    });
    expect(logs).toContain('cwd: /srv');
    expect(logs).toContain('cmd: /srv/java');
    expect(logs.some((l) => l.startsWith('arg: '))).toBe(true);
  });

  it('throws when the manifest has no launch config', async () => {
    const noLaunch = decodeManifest({ vars: {}, artifacts: [] });
    await expect(launch(noLaunch, { install: false })).rejects.toThrow(
      'No launch config',
    );
  });

  it('runs the install phase when install is not disabled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'torba-launch-'));
    try {
      const dest = join(dir, 'installed.txt');
      const m = decodeManifest({
        vars: {},
        launch: { command: 'java', workdir: '.', args: [] },
        artifacts: [{ path: dest, source: { string: 'payload' } }],
      });
      await launch(m, { platform: LINUX });
      expect(existsSync(dest)).toBe(true);
      expect(await readFile(dest, 'utf8')).toBe('payload');
      expect(spawnMock).toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
