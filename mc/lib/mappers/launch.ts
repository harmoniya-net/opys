import type { Valset, OsOptions } from '@unifest/rules';
import { parseValset, resolveValset, allowOsRuleset } from '@unifest/rules';
import type { MojangArgValue } from '@unifest/minecraft';
import type { Launch, ValDefs } from '@unifest/core';

export function mojangArgsToValset(args: MojangArgValue[]): Valset {
  return parseValset(args as unknown[]);
}

export function buildClasspath(
  libs: { rules: unknown[]; artifactPath: string }[],
  clientJarPath: string,
): ValDefs {
  const platforms: { name: 'linux' | 'windows' | 'osx'; arch: string }[] = [
    { name: 'linux', arch: 'x86_64' },
    { name: 'windows', arch: 'x86_64' },
    { name: 'osx', arch: 'x86_64' },
  ];

  const entries: [string, { value: string; rules: unknown[] }][] = [];

  for (const { name, arch } of platforms) {
    const os: OsOptions = { name, version: '', arch };
    const applicable = libs
      .filter((l) => l.rules.length === 0 || satisfiesRulesImpl(l.rules, os))
      .map((l) => l.artifactPath);
    const value = [clientJarPath, ...applicable].join('${classpath_separator}');
    entries.push(['classpath', { value, rules: allowOsRuleset(name) }]);
  }

  return entries;
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
): Launch {
  const allArgs = [...jvmArgs, mainClass, ...gameArgs];
  return {
    command: 'java',
    workdir: './',
    args: mojangArgsToValset(allArgs),
    envs: [],
  };
}

export function resolveLaunchArgs(
  launch: Launch,
  os: OsOptions,
  feats: string[] = [],
): string[] {
  return resolveValset(launch.args, os, feats);
}
