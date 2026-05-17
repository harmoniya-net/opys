import type { Val, Valset, OsOptions } from '@torba/mojang-rules';
import {
  parseValset,
  resolveValset,
  allowOsRuleset,
} from '@torba/mojang-rules';
import type { MojangArgValue } from '@torba/mojang';
import type { Launch, ConditionalVal } from '@torba/core';

export function mojangArgsToValset(args: MojangArgValue[]): Valset {
  return parseValset(args as unknown[]);
}

/**
 * Decomposed parts of a Minecraft `Launch` config. `launch` is the
 * assembled `Launch` (drop straight into `manifest.launch`); the
 * remaining fields expose the JVM args, main class, and game args
 * separately so callers can interleave their own JVM args (e.g. from
 * `@torba/authliberty`) before the main class.
 *
 * `mainClass` is exposed as a `Val` so it slots directly into a
 * `Valset` between `jvmArgs` and `gameArgs`. Use `mainClass.value[0]`
 * for the raw class name.
 */
export interface LaunchParts {
  launch: Launch;
  jvmArgs: Valset;
  mainClass: Val;
  gameArgs: Valset;
}

export function buildClasspath(
  libs: { rules: unknown[]; artifactPath: string }[],
  clientJarPath: string,
): ConditionalVal[] {
  const platforms: { name: 'linux' | 'windows' | 'osx'; arch: string }[] = [
    { name: 'linux', arch: 'x86_64' },
    { name: 'windows', arch: 'x86_64' },
    { name: 'osx', arch: 'x86_64' },
  ];

  const arms: ConditionalVal[] = [];
  for (const { name, arch } of platforms) {
    const os: OsOptions = { name, version: '', arch };
    const applicable = libs
      .filter((l) => l.rules.length === 0 || satisfiesRulesImpl(l.rules, os))
      .map((l) => l.artifactPath);
    const value = [clientJarPath, ...applicable].join('${classpath_separator}');
    arms.push({ value, rules: allowOsRuleset(name) });
  }
  return arms;
}

function satisfiesRulesImpl(rules: unknown[], os: OsOptions): boolean {
  if (rules.length === 0) return true;
  return rules.every((r: any) => {
    const allow = r.action === 'allow';
    if (r.os) {
      const o = r.os;
      if (o.name && o.name !== os.name) return !allow;
      if (o.arch && o.arch !== os.arch) return !allow;
      return allow;
    }
    return allow;
  });
}

export function buildLaunch(
  mainClass: string,
  gameArgs: MojangArgValue[],
  jvmArgs: MojangArgValue[],
): LaunchParts {
  const jvm = mojangArgsToValset(jvmArgs);
  const game = mojangArgsToValset(gameArgs);
  const main: Val = { rules: [], value: [mainClass] };
  const launch: Launch = {
    command: '${java_bin}',
    workdir: './',
    args: [...jvm, main, ...game],
    envs: {},
  };
  return { launch, jvmArgs: jvm, mainClass: main, gameArgs: game };
}

export function resolveLaunchArgs(
  launch: Launch,
  os: OsOptions,
  feats: string[] = [],
): string[] {
  return resolveValset(launch.args, os, feats);
}
