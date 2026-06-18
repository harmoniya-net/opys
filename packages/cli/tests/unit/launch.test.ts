import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const installMock = vi.hoisted(() => vi.fn());
const launchMock = vi.hoisted(() => vi.fn());

vi.mock('@opys/runtime', () => ({
  install: installMock,
  launch: launchMock,
}));

import { cmdLaunch } from '../../lib/commands/launch';
import { UsageError } from '../../lib/errors';
import { Logger } from '../../lib/logger';

let dir = '';
const logger = new Logger('silent');

// cmdLaunch builds the manifest in-memory from this config — no opys.json.
const CONFIG = `export default {
  plugins: [],
  manifest: { command: () => 'java', args: () => [], workdir: '.' },
};`;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'opys-launch-'));
  installMock.mockReset();
  launchMock.mockReset();
  // install does nothing by default; launch yields a child that exits 0.
  installMock.mockResolvedValue(undefined);
  launchMock.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & { pid?: number };
    child.pid = 999;
    setTimeout(() => child.emit('exit', 0), 0);
    return Promise.resolve(child);
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (dir) await rm(dir, { recursive: true, force: true });
});

/** Write a config file to the temp dir and return its path. */
async function fixture(config = CONFIG): Promise<string> {
  const cfgPath = join(dir, 'opys.config.mjs');
  await writeFile(cfgPath, config, 'utf8');
  return cfgPath;
}

describe('cmdLaunch — happy path', () => {
  it('builds the config, installs, then launches', async () => {
    const cfg = await fixture();
    await cmdLaunch(['-i', cfg], logger, 'launch');
    expect(installMock).toHaveBeenCalledOnce();
    expect(launchMock).toHaveBeenCalledOnce();
  });

  it('launches the in-memory built manifest (no opys.json needed)', async () => {
    const cfg = await fixture();
    await cmdLaunch(['-i', cfg], logger, 'launch');
    const manifestArg = launchMock.mock.calls[0]![0];
    expect(manifestArg.launch.command).toBe('java');
  });

  it('passes install:false to launch so it never rebuilds', async () => {
    const cfg = await fixture();
    await cmdLaunch(['-i', cfg], logger, 'launch');
    expect(launchMock.mock.calls[0]![1]).toMatchObject({ install: false });
  });

  it('resolves when the child exits with a null code', async () => {
    launchMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { pid?: number };
      child.pid = 1;
      setTimeout(() => child.emit('exit', null), 0);
      return Promise.resolve(child);
    });
    const cfg = await fixture();
    await expect(
      cmdLaunch(['-i', cfg], logger, 'launch'),
    ).resolves.toBeUndefined();
  });

  it('defaults the input file to opys.config.mjs in cwd', async () => {
    await fixture();
    const origCwd = process.cwd();
    process.chdir(dir);
    try {
      await cmdLaunch([], logger, 'launch');
    } finally {
      process.chdir(origCwd);
    }
    expect(launchMock).toHaveBeenCalledOnce();
  });

  it('applies a runClient patch over the built manifest', async () => {
    const patched = `export default {
      plugins: [],
      manifest: { command: () => 'java', args: () => [], workdir: '.' },
      runClient: (m) => ({ vars: { ...m.vars, username: 'Steve' } }),
    };`;
    const cfg = await fixture(patched);
    await cmdLaunch(['-i', cfg], logger, 'launch');
    const manifestArg = launchMock.mock.calls[0]![0];
    expect(manifestArg.vars.username).toBe('Steve');
  });
});

describe('cmdLaunch — manifest var validation', () => {
  it('throws when runClient produces a numeric var value', async () => {
    const patched = `export default {
      plugins: [],
      manifest: { command: () => 'java', args: () => [], workdir: '.' },
      runClient: () => ({ vars: { xmx: 4000 } }),
    };`;
    const cfg = await fixture(patched);
    await expect(cmdLaunch(['-i', cfg], logger, 'launch')).rejects.toThrow(
      /var 'xmx'/,
    );
  });

  it('accepts string and ConditionalVal[] var values from runClient', async () => {
    const patched = `export default {
      plugins: [],
      manifest: { command: () => 'java', args: () => [], workdir: '.' },
      runClient: () => ({
        vars: {
          xmx: '4000',
          token: [{ value: 'abc', rules: [] }],
        },
      }),
    };`;
    const cfg = await fixture(patched);
    await expect(
      cmdLaunch(['-i', cfg], logger, 'launch'),
    ).resolves.toBeUndefined();
  });
});

describe('cmdLaunch — error handling', () => {
  it('throws a UsageError when the config has no default export', async () => {
    const cfg = await fixture('export const x = 1;');
    await expect(cmdLaunch(['-i', cfg], logger, 'launch')).rejects.toThrow(
      UsageError,
    );
  });

  it('rejects when the child exits with a non-zero code', async () => {
    launchMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { pid?: number };
      child.pid = 2;
      setTimeout(() => child.emit('exit', 3), 0);
      return Promise.resolve(child);
    });
    const cfg = await fixture();
    await expect(cmdLaunch(['-i', cfg], logger, 'launch')).rejects.toThrow(
      /exit 3/,
    );
  });

  it('rejects when the child emits an error event', async () => {
    launchMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { pid?: number };
      child.pid = 4;
      setTimeout(() => child.emit('error', new Error('boom')), 0);
      return Promise.resolve(child);
    });
    const cfg = await fixture();
    await expect(cmdLaunch(['-i', cfg], logger, 'launch')).rejects.toThrow(
      /boom/,
    );
  });
});

describe('cmdLaunch — progress reporting', () => {
  it('drives every install progress phase without throwing', async () => {
    installMock.mockImplementation(async (_m, opts) => {
      const onP = opts.onProgress;
      onP({ phase: 'download', total: 4, fetched: 0 });
      onP({ phase: 'download:start', path: 'mods/a.jar', total: 1024 });
      onP({ phase: 'download:bytes', path: 'mods/a.jar', bytes: 512 });
      // bytes for an unknown path is ignored
      onP({ phase: 'download:bytes', path: 'unknown.jar', bytes: 1 });
      onP({ phase: 'download:done', path: 'mods/a.jar' });
      onP({ phase: 'verify' });
      onP({ phase: 'extract', count: 1 });
      onP({ phase: 'extract', count: 3 });
      onP({ phase: 'sweep', removed: 1 });
      onP({ phase: 'sweep', removed: 5 });
    });
    const cfg = await fixture();
    await expect(
      cmdLaunch(['-i', cfg], logger, 'launch'),
    ).resolves.toBeUndefined();
  });

  it('throttles non-forced progress renders', async () => {
    installMock.mockImplementation(async (_m, opts) => {
      const onP = opts.onProgress;
      // two quick non-forced renders — the second is throttled out
      onP({ phase: 'download:start', path: 'a.jar', total: 0 });
      onP({ phase: 'download:start', path: 'b.jar', total: 0 });
    });
    const cfg = await fixture();
    await expect(
      cmdLaunch(['-i', cfg], logger, 'launch'),
    ).resolves.toBeUndefined();
  });
});
