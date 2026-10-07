import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUNDLE_FORMAT, readBundle, readBundleHead } from '@opys/core';
import { cmdBuild } from '../../lib/commands/build';
import { UsageError } from '../../lib/errors';
import { Logger } from '../../lib/logger';

let dir = '';
const logger = new Logger('silent');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'opys-build-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (dir) await rm(dir, { recursive: true, force: true });
});

/**
 * Writes a config module to the temp dir. The config uses a plain inline
 * plugin object so it has no third-party imports — `cmdBuild` only needs
 * `mod.default` to be a `OpysConfigInput`.
 */
async function writeConfig(file: string, body: string): Promise<string> {
  const path = join(dir, file);
  await writeFile(path, body, 'utf8');
  return path;
}

/** sha256 of `x` — the one blob the fixture plugin carries. */
const X = '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881';

const INLINE_PLUGIN = `{
  name: 'fixture',
  build: () => ({
    artifacts: [
      { path: 'a.jar', source: { blob: '${X}' }, rules: [] },
    ],
    blobs: { '${X}': { bytes: 'eA==' } },
    vars: { root: '/games' },
    launch: {},
  }),
}`;

const BASE_CONFIG = `export default {
  output: 'game.opys',
  plugins: [${INLINE_PLUGIN}],
  manifest: {
    command: () => 'java',
    args: () => ['-jar', 'a.jar'],
    workdir: '.',
  },
};`;

describe('cmdBuild', () => {
  it('writes a bundle to the config-declared output file', async () => {
    await writeConfig('opys.config.mjs', BASE_CONFIG);
    await cmdBuild(['-i', join(dir, 'opys.config.mjs')], logger, 'build');
    const manifest = readBundle(join(dir, 'game.opys'));
    expect(manifest.artifacts).toEqual([
      { path: 'a.jar', source: { blob: X } },
    ]);
    expect(manifest.launch?.command).toBe('java');
    // The head is readable on its own, without the list.
    expect(readBundleHead(join(dir, 'game.opys'))).toEqual({
      format: BUNDLE_FORMAT,
      vars: { root: '/games' },
      launch: manifest.launch,
    });
    expect(existsSync(join(dir, 'game.opys.partial'))).toBe(false);
  });

  it('the bundle is a zip that carries the blob', async () => {
    await writeConfig('opys.config.mjs', BASE_CONFIG);
    await cmdBuild(['-i', join(dir, 'opys.config.mjs')], logger, 'build');
    const bytes = await readFile(join(dir, 'game.opys'));
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    // Entry names are stored as they are, and so is the head.
    expect(bytes.includes(`blobs/${X}`)).toBe(true);
    expect(bytes.includes('"format": 1')).toBe(true);
  });

  it('fails, and leaves nothing behind, when a blob is not what its name says', async () => {
    const lying = BASE_CONFIG.replace("bytes: 'eA=='", "bytes: 'eQ=='");
    await writeConfig('opys.config.mjs', lying);
    await expect(
      cmdBuild(['-i', join(dir, 'opys.config.mjs')], logger, 'build'),
    ).rejects.toThrow(/does not hold what its name says/);
    expect(existsSync(join(dir, 'game.opys'))).toBe(false);
    expect(existsSync(join(dir, 'game.opys.partial'))).toBe(false);
  });

  it('honours an explicit --output flag over config.output', async () => {
    await writeConfig('opys.config.mjs', BASE_CONFIG);
    await cmdBuild(
      ['-i', join(dir, 'opys.config.mjs'), '-o', 'custom.opys'],
      logger,
      'build',
    );
    expect(readBundle(join(dir, 'custom.opys')).artifacts).toHaveLength(1);
    expect(existsSync(join(dir, 'game.opys'))).toBe(false);
  });

  it('prints the manifest as JSON when no output is configured', async () => {
    const noOutput = `export default {
      plugins: [${INLINE_PLUGIN}],
      manifest: { command: () => 'java', args: () => [], workdir: '.' },
    };`;
    await writeConfig('opys.config.mjs', noOutput);
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      out.push(String(c));
      return true;
    });
    await cmdBuild(['-i', join(dir, 'opys.config.mjs')], logger, 'build');
    const printed = JSON.parse(out.join(''));
    // A view of the manifest: it names the blob and does not carry it.
    expect(printed.artifacts).toEqual([{ path: 'a.jar', source: { blob: X } }]);
    expect(out.join('').endsWith('\n')).toBe(true);
  });

  it('defaults the input file to opys.config.mjs in cwd', async () => {
    await writeConfig('opys.config.mjs', BASE_CONFIG);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      await cmdBuild([], logger, 'build');
    } finally {
      cwd.mockRestore();
    }
    expect(readBundle(join(dir, 'game.opys')).artifacts).toHaveLength(1);
  });

  it('passes the mode through to a config function', async () => {
    const fnConfig = `export default (ctx) => ({
      output: 'mode.opys',
      plugins: [${INLINE_PLUGIN}],
      manifest: {
        command: () => 'java',
        args: () => [ctx.mode],
        workdir: '.',
      },
    });`;
    await writeConfig('opys.config.mjs', fnConfig);
    await cmdBuild(
      ['-i', join(dir, 'opys.config.mjs'), '--mode', 'staging'],
      logger,
      'build',
    );
    const head = readBundleHead(join(dir, 'mode.opys'));
    expect(JSON.stringify(head.launch?.args)).toContain('staging');
  });

  it('throws a UsageError when the config has no default export', async () => {
    await writeConfig('opys.config.mjs', 'export const notDefault = 1;');
    await expect(
      cmdBuild(['-i', join(dir, 'opys.config.mjs')], logger, 'build'),
    ).rejects.toThrow(UsageError);
  });

  it('forwards build log lines through the logger', async () => {
    await writeConfig('opys.config.mjs', BASE_CONFIG);
    const spyLogger = new Logger('info');
    const info = vi.spyOn(spyLogger, 'info').mockImplementation(() => {});
    await cmdBuild(['-i', join(dir, 'opys.config.mjs')], spyLogger, 'build');
    expect(info).toHaveBeenCalled();
    expect(info.mock.calls.some((c) => String(c[0]).includes('[opys]'))).toBe(
      true,
    );
  });
});
