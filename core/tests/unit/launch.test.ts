import { describe, expect, it } from 'vitest';
import {
  decodeLaunch,
  encodeLaunch,
  resolvedArgs,
  resolvedEnvs,
} from '../../lib/launch';
import { LINUX, OSX } from './fixtures';

describe('decodeLaunch', () => {
  it('decodes a minimal launch with no args or envs', () => {
    const launch = decodeLaunch({ command: 'java', workdir: './' });
    expect(launch.command).toBe('java');
    expect(launch.workdir).toBe('./');
    expect(launch.args).toEqual([]);
    expect(launch.envs).toEqual({});
  });

  it('decodes shorthand args and envs', () => {
    const launch = decodeLaunch({
      command: 'java',
      workdir: '.',
      args: ['-jar', 'app.jar'],
      envs: { JAVA_OPTS: '-Xmx2g' },
    });
    expect(launch.args).toHaveLength(2);
    expect(launch.envs.JAVA_OPTS).toBeDefined();
  });
});

describe('encodeLaunch', () => {
  it('round-trips through decode', () => {
    const wire = {
      command: 'java',
      workdir: '/srv',
      args: ['-jar', 'app.jar'],
      envs: { KEY: 'value' },
    };
    const encoded = encodeLaunch(decodeLaunch(wire));
    expect(encoded.command).toBe('java');
    expect(encoded.workdir).toBe('/srv');
    expect(encoded.args).toEqual(['-jar', 'app.jar']);
    expect(encoded.envs).toEqual({ KEY: 'value' });
  });
});

describe('resolvedArgs', () => {
  it('resolves unconditional args for any OS', () => {
    const launch = decodeLaunch({
      command: 'java',
      workdir: '.',
      args: ['-jar', 'app.jar'],
    });
    expect(resolvedArgs(launch, LINUX)).toEqual(['-jar', 'app.jar']);
  });

  it('filters OS-conditional args', () => {
    const launch = decodeLaunch({
      command: 'java',
      workdir: '.',
      args: [
        {
          rules: [{ action: 'allow', os: { name: 'linux' } }],
          value: '-linux',
        },
        { rules: [{ action: 'allow', os: { name: 'osx' } }], value: '-mac' },
        'common',
      ],
    });
    expect(resolvedArgs(launch, LINUX)).toEqual(['-linux', 'common']);
    expect(resolvedArgs(launch, OSX)).toEqual(['-mac', 'common']);
  });

  it('honors feature flags', () => {
    const launch = decodeLaunch({
      command: 'java',
      workdir: '.',
      args: [
        {
          rules: [{ action: 'allow', features: { demo: true } }],
          value: '-demo',
        },
      ],
    });
    expect(resolvedArgs(launch, LINUX, ['demo'])).toEqual(['-demo']);
    expect(resolvedArgs(launch, LINUX)).toEqual([]);
  });
});

describe('resolvedEnvs', () => {
  it('resolves env definitions to a flat record', () => {
    const launch = decodeLaunch({
      command: 'java',
      workdir: '.',
      envs: { JAVA_HOME: '/jdk', PATH: '/bin' },
    });
    expect(resolvedEnvs(launch, LINUX)).toEqual({
      JAVA_HOME: '/jdk',
      PATH: '/bin',
    });
  });

  it('returns an empty record when no envs are defined', () => {
    const launch = decodeLaunch({ command: 'java', workdir: '.' });
    expect(resolvedEnvs(launch, LINUX)).toEqual({});
  });
});
