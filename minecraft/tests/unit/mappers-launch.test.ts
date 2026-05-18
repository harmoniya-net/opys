import { describe, expect, it } from 'vitest';
import { buildClasspath, buildLaunch } from '../../lib/mappers/launch';
import { allowOsRuleset } from '@torba/core';

describe('buildClasspath', () => {
  it('produces one conditional arm per platform', () => {
    const arms = buildClasspath([], 'client.jar');
    expect(arms).toHaveLength(3);
  });

  it('joins the client jar and applicable libs with the separator var', () => {
    const arms = buildClasspath(
      [{ rules: [], artifactPath: '${library_directory}/a.jar' }],
      '${version_dir}/client.jar',
    );
    expect(arms[0]!.value).toBe(
      '${version_dir}/client.jar${classpath_separator}${library_directory}/a.jar',
    );
  });

  it('filters libraries by their OS rules', () => {
    const arms = buildClasspath(
      [{ rules: allowOsRuleset('linux'), artifactPath: 'linux-only.jar' }],
      'client.jar',
    );
    const byOs = Object.fromEntries(
      arms.map((a) => {
        const rule = a.rules[0] as { os: { name: string } };
        return [rule.os.name, a.value];
      }),
    );
    expect(byOs.linux).toContain('linux-only.jar');
    expect(byOs.windows).not.toContain('linux-only.jar');
    expect(byOs.osx).not.toContain('linux-only.jar');
  });

  it('emits just the client jar when there are no libraries', () => {
    const arms = buildClasspath([], 'only.jar');
    for (const arm of arms) expect(arm.value).toBe('only.jar');
  });

  it('tags each arm with an allow-os ruleset', () => {
    const arms = buildClasspath([], 'c.jar');
    for (const arm of arms) {
      expect(arm.rules[0]).toMatchObject({ action: 'allow' });
    }
  });
});

describe('buildLaunch', () => {
  it('assembles a Launch with jvm args, main class and game args in order', () => {
    const parts = buildLaunch('net.minecraft.Main', ['--game'], ['-Xmx1G']);
    expect(parts.launch.command).toBe('${java_bin}');
    expect(parts.launch.workdir).toBe('./');
    expect(parts.launch.envs).toEqual({});
    // jvm(1) + mainClass(1) + game(1)
    expect(parts.launch.args).toHaveLength(3);
  });

  it('wraps the main class as a Val with the raw name at value[0]', () => {
    const parts = buildLaunch('com.example.Main', [], []);
    expect(parts.mainClass).toEqual({
      rules: [],
      value: ['com.example.Main'],
    });
  });

  it('exposes jvm args and game args separately', () => {
    const parts = buildLaunch('Main', ['--username', '${user}'], ['-cp']);
    expect(parts.jvmArgs).toHaveLength(1);
    expect(parts.gameArgs).toHaveLength(2);
  });

  it('places jvmArgs before mainClass before gameArgs in launch.args', () => {
    const parts = buildLaunch('Main', ['game'], ['jvm']);
    expect(parts.launch.args[0]).toBe(parts.jvmArgs[0]);
    expect(parts.launch.args[1]).toBe(parts.mainClass);
    expect(parts.launch.args[2]).toBe(parts.gameArgs[0]);
  });

  it('handles empty arg lists', () => {
    const parts = buildLaunch('Main', [], []);
    expect(parts.launch.args).toEqual([parts.mainClass]);
  });
});
