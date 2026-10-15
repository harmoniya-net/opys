import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const installMock = vi.hoisted(() => vi.fn());
const launchMock = vi.hoisted(() => vi.fn());

vi.mock('@opys/runtime', () => ({
  install: installMock,
  launch: launchMock,
}));

import { cmdInstall } from '../../lib/commands/install';
import { Logger } from '../../lib/logger';

let dir = '';
const logger = new Logger('silent');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'opys-install-'));
  installMock.mockReset().mockResolvedValue(undefined);
  launchMock.mockReset();
});

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('cmdInstall', () => {
  it('installs what the config builds and starts nothing', async () => {
    const cfg = join(dir, 'opys.config.mjs');
    // A loader's arguments are the game's business, not the install's.
    await writeFile(
      cfg,
      `export default {
        plugins: [],
        manifest: { command: 'java', args: ['-Dhorno.installer=x.jar', 'Main'], workdir: '.' },
      };`,
      'utf8',
    );
    await cmdInstall(['-i', cfg, '--feature', 'a'], logger, 'install');
    expect(installMock).toHaveBeenCalledOnce();
    expect(installMock.mock.calls[0]![1]).toMatchObject({ features: ['a'] });
    expect(launchMock).not.toHaveBeenCalled();
  });

  it('installs a bundle behind a URL with the vars it is given', async () => {
    const url = 'https://example.com/game.opys';
    await cmdInstall([url, '--var', 'root=/srv'], logger, 'install');
    expect(installMock.mock.calls[0]![0]).toEqual({ url });
    expect(installMock.mock.calls[0]![1]).toMatchObject({
      vars: { root: '/srv' },
    });
    expect(launchMock).not.toHaveBeenCalled();
  });

  it('rejects when the install fails', async () => {
    installMock.mockRejectedValue(new Error('network down'));
    await expect(
      cmdInstall(['https://example.com/game.opys'], logger, 'install'),
    ).rejects.toThrow(/network down/);
  });
});
