import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdBuild } from '../../lib/commands/build';
import { UsageError } from '../../lib/errors';
import { Logger } from '../../lib/logger';

let dir = '';
const logger = new Logger('silent');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lanka-build-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (dir) await rm(dir, { recursive: true, force: true });
});

/**
 * Writes a config module to the temp dir. The config uses a plain inline
 * plugin object so it has no third-party imports — `cmdBuild` only needs
 * `mod.default` to be a `LankaConfigInput`.
 */
async function writeConfig(file: string, body: string): Promise<string> {
  const path = join(dir, file);
  await writeFile(path, body, 'utf8');
  return path;
}

const INLINE_PLUGIN = `{
  name: 'fixture',
  build: () => ({
    artifacts: [
      { path: 'a.jar', source: { kind: 'string', string: 'x' }, rules: [] },
    ],
    vars: { root: '/games' },
    launch: {},
  }),
}`;

const BASE_CONFIG = `export default {
  output: 'lanka.json',
  plugins: [${INLINE_PLUGIN}],
  manifest: {
    command: () => 'java',
    args: () => ['-jar', 'a.jar'],
    workdir: '.',
  },
};`;

describe('cmdBuild', () => {
  it('writes the manifest to the config-declared output file', async () => {
    await writeConfig('lanka.config.mjs', BASE_CONFIG);
    await cmdBuild(['-i', join(dir, 'lanka.config.mjs')], logger, 'build');
    const written = await readFile(join(dir, 'lanka.json'), 'utf8');
    const manifest = JSON.parse(written);
    expect(manifest.artifacts).toHaveLength(1);
    expect(manifest.artifacts[0].path).toBe('a.jar');
    expect(manifest.launch.command).toBe('java');
    expect(written.endsWith('\n')).toBe(true);
  });

  it('honours an explicit --output flag over config.output', async () => {
    await writeConfig('lanka.config.mjs', BASE_CONFIG);
    await cmdBuild(
      ['-i', join(dir, 'lanka.config.mjs'), '-o', 'custom.json'],
      logger,
      'build',
    );
    const written = await readFile(join(dir, 'custom.json'), 'utf8');
    expect(JSON.parse(written).artifacts).toHaveLength(1);
  });

  it('prints the manifest to stdout when no output is configured', async () => {
    const noOutput = `export default {
      plugins: [${INLINE_PLUGIN}],
      manifest: { command: () => 'java', args: () => [], workdir: '.' },
    };`;
    await writeConfig('lanka.config.mjs', noOutput);
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      out.push(String(c));
      return true;
    });
    await cmdBuild(['-i', join(dir, 'lanka.config.mjs')], logger, 'build');
    expect(out.join('')).toContain('"artifacts"');
  });

  it('defaults the input file to lanka.config.mjs in cwd', async () => {
    await writeConfig('lanka.config.mjs', BASE_CONFIG);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      await cmdBuild([], logger, 'build');
    } finally {
      cwd.mockRestore();
    }
    const written = await readFile(join(dir, 'lanka.json'), 'utf8');
    expect(JSON.parse(written).artifacts).toHaveLength(1);
  });

  it('passes the mode through to a config function', async () => {
    const fnConfig = `export default (ctx) => ({
      output: 'mode.json',
      plugins: [${INLINE_PLUGIN}],
      manifest: {
        command: () => 'java',
        args: () => [ctx.mode],
        workdir: '.',
      },
    });`;
    await writeConfig('lanka.config.mjs', fnConfig);
    await cmdBuild(
      ['-i', join(dir, 'lanka.config.mjs'), '--mode', 'staging'],
      logger,
      'build',
    );
    const manifest = JSON.parse(await readFile(join(dir, 'mode.json'), 'utf8'));
    expect(JSON.stringify(manifest.launch.args)).toContain('staging');
  });

  it('throws a UsageError when the config has no default export', async () => {
    await writeConfig('lanka.config.mjs', 'export const notDefault = 1;');
    await expect(
      cmdBuild(['-i', join(dir, 'lanka.config.mjs')], logger, 'build'),
    ).rejects.toThrow(UsageError);
  });

  it('forwards build log lines through the logger', async () => {
    await writeConfig('lanka.config.mjs', BASE_CONFIG);
    const spyLogger = new Logger('info');
    const info = vi.spyOn(spyLogger, 'info').mockImplementation(() => {});
    await cmdBuild(['-i', join(dir, 'lanka.config.mjs')], spyLogger, 'build');
    expect(info).toHaveBeenCalled();
    expect(info.mock.calls.some((c) => String(c[0]).includes('[lanka]'))).toBe(
      true,
    );
  });
});
