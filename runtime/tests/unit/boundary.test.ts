import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  buildLaunch,
  currentPlatform,
  install,
  type InstallProgress,
} from '../../lib';

describe('@lanka/runtime — napi boundary smoke', () => {
  test('currentPlatform reports a non-empty name', () => {
    expect(currentPlatform().name.length).toBeGreaterThan(0);
  });

  test('install writes a string source and emits phase events', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lanka-napi-rt-'));
    const events: string[] = [];
    await install(
      {
        vars: { root: dir },
        artifacts: [{ path: '${root}/hello.txt', source: { string: 'world' } }],
      },
      {
        verifyIntegrity: true,
        onProgress: (p: InstallProgress) => events.push(p.phase),
      },
    );
    expect(readFileSync(join(dir, 'hello.txt'), 'utf8')).toBe('world');
    expect(events).toContain('resolve');
    expect(events).toContain('verify');
    expect(events).toContain('download:done');
  });

  test('install skips an artifact whose target already exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lanka-napi-rt-skip-'));
    writeFileSync(join(dir, 'exists.txt'), 'prior');
    await install(
      {
        vars: { root: dir },
        artifacts: [
          { path: '${root}/exists.txt', source: { string: 'fresh' } },
        ],
      },
      {},
    );
    expect(readFileSync(join(dir, 'exists.txt'), 'utf8')).toBe('prior');
  });

  test('buildLaunch interpolates command/workdir/args', async () => {
    const spec = await buildLaunch({
      vars: { root: '/srv', jvm: '/opt/jdk/bin/java' },
      launch: {
        command: '${jvm}',
        workdir: '${root}',
        args: ['-Xmx2G', '-jar', '${root}/app.jar'],
      },
      artifacts: [],
    });
    expect(spec.command).toBe('/opt/jdk/bin/java');
    expect(spec.workdir).toBe('/srv');
    expect(spec.args).toEqual(['-Xmx2G', '-jar', '/srv/app.jar']);
  });

  test('buildLaunch picks os-allowed args via rules', async () => {
    const spec = await buildLaunch(
      {
        launch: {
          command: 'java',
          workdir: '.',
          args: [
            '-Xmx1G',
            { value: '-XstartOnFirstThread', rules: 'allow.os.osx' },
            { value: '--linux-only', rules: 'allow.os.linux' },
          ],
        },
        artifacts: [],
      },
      { platform: { name: 'linux', version: '', arch: 'x86_64' } },
    );
    expect(spec.args).toContain('-Xmx1G');
    expect(spec.args).toContain('--linux-only');
    expect(spec.args).not.toContain('-XstartOnFirstThread');
  });
});
