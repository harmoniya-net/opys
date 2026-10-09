import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBundle } from '@opys/bundle';

const installMock = vi.hoisted(() => vi.fn());
const buildLaunchMock = vi.hoisted(() => vi.fn());
const spawnLaunchMock = vi.hoisted(() => vi.fn());

vi.mock('@opys/runtime', () => ({
  install: installMock,
  buildLaunch: buildLaunchMock,
  spawnLaunch: spawnLaunchMock,
}));

import { cmdInstall } from '../../lib/commands/install';
import { Logger } from '../../lib/logger';

let dir = '';
const logger = new Logger('silent');

const config = (args: string) => `export default {
  plugins: [],
  manifest: { command: 'java', args: ${args}, workdir: '.' },
};`;

const HORNO = `['-Dhorno.installer=x.jar', '-cp', 'a.jar', 'Main']`;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'opys-install-'));
  installMock.mockReset().mockResolvedValue(undefined);
  // The launch as the manifest spells it; the command adds to what comes back.
  buildLaunchMock.mockReset().mockResolvedValue({
    command: 'java',
    args: ['-Dhorno.installer=x.jar', '-cp', 'a.jar', 'Main'],
    workdir: '.',
    envs: {},
  });
  spawnLaunchMock.mockReset().mockImplementation(() => {
    const child = new EventEmitter();
    setTimeout(() => child.emit('exit', 0), 0);
    return child;
  });
});

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function fixture(args: string): Promise<string> {
  const path = join(dir, 'opys.config.mjs');
  await writeFile(path, config(args), 'utf8');
  return path;
}

describe('cmdInstall', () => {
  it('installs and stops when the manifest names no loader install step', async () => {
    const cfg = await fixture(`['-cp', 'a.jar', 'Main']`);
    await cmdInstall(['-i', cfg], logger, 'install');
    expect(installMock).toHaveBeenCalledOnce();
    expect(spawnLaunchMock).not.toHaveBeenCalled();
  });

  it('runs the loader once with the install-only flag first on the line', async () => {
    const cfg = await fixture(HORNO);
    await cmdInstall(['-i', cfg], logger, 'install');
    const source = installMock.mock.calls[0]![0];
    expect(buildLaunchMock.mock.calls[0]![0]).toBe(source);
    const spec = spawnLaunchMock.mock.calls[0]![0];
    expect(spec.args).toEqual([
      '-Dhorno.installOnly=true',
      '-Dhorno.installer=x.jar',
      '-cp',
      'a.jar',
      'Main',
    ]);
    // The flag is added to the run, never to the manifest that was installed.
    expect(JSON.stringify(source)).not.toContain('installOnly');
  });

  it('does the same for a built bundle, read by its head', async () => {
    const path = join(dir, 'game.opys');
    await writeBundle(path, {
      vars: {},
      launch: {
        command: 'java',
        workdir: '.',
        args: ['-Dhorno.installer=x.jar', 'Main'],
        envs: {},
      },
      artifacts: [],
    });
    await cmdInstall([path, '--var', 'root=/srv'], logger, 'install');
    expect(installMock.mock.calls[0]![0]).toEqual({ bundle: path });
    expect(installMock.mock.calls[0]![1]).toMatchObject({
      vars: { root: '/srv' },
    });
    expect(buildLaunchMock.mock.calls[0]).toEqual([
      { bundle: path },
      { features: [], vars: { root: '/srv' } },
    ]);
    expect(spawnLaunchMock).toHaveBeenCalledOnce();
  });

  it('a bundle with nothing to launch is installed and left at that', async () => {
    const path = join(dir, 'files.opys');
    await writeBundle(path, { vars: {}, artifacts: [] });
    await cmdInstall([path], logger, 'install');
    expect(installMock).toHaveBeenCalledOnce();
    expect(buildLaunchMock).not.toHaveBeenCalled();
  });

  it('rejects when the loader run fails', async () => {
    spawnLaunchMock.mockImplementation(() => {
      const child = new EventEmitter();
      setTimeout(() => child.emit('exit', 1), 0);
      return child;
    });
    const cfg = await fixture(HORNO);
    await expect(cmdInstall(['-i', cfg], logger, 'install')).rejects.toThrow(
      /exited with code 1/,
    );
  });
});
