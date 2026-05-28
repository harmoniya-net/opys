import type { Val, Valset, OsOptions, Ruleset } from '@lanka/core';
import { parseValset, allowOsRuleset, satisfiesRuleset } from '@lanka/core';
import type { MojangArgValue } from '@lanka/mojang';
import type { Launch, ConditionalVal } from '@lanka/core';

/**
 * Decomposed parts of a Minecraft `Launch` config. `launch` is the
 * assembled `Launch` (drop straight into `manifest.launch`); the
 * remaining fields expose the JVM args, main class, and game args
 * separately so callers can interleave their own JVM args (e.g. from
 * `@lanka/authliberty`) before the main class.
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

/**
 * Build the `${classpath}` arms — one per OS.
 *
 * Minecraft / forge / cleanroom library `rules` gate on OS only, never
 * `arch` (verified across version JSONs 1.7.10–1.21.4 — the only arch
 * dimension Mojang ever used is the legacy `natives`-map `${arch}`
 * substitution, handled separately). So the classpath is computed once
 * per OS; the `arch` below is a fixed placeholder, required solely
 * because `OsOptions` mandates the field. If an `os.arch` rule ever
 * appears in a version JSON, this must become per-(os, arch).
 */
export function buildClasspath(
  libs: { rules: Ruleset; artifactPath: string }[],
  clientJarPath: string,
): ConditionalVal[] {
  const oses: ('linux' | 'windows' | 'osx')[] = ['linux', 'windows', 'osx'];

  const arms: ConditionalVal[] = [];
  for (const name of oses) {
    const os: OsOptions = { name, version: '', arch: 'x86_64' };
    const applicable = libs
      .filter((l) => satisfiesRuleset(l.rules, os))
      .map((l) => l.artifactPath);
    const value = [clientJarPath, ...applicable].join('${classpath_separator}');
    arms.push({ value, rules: allowOsRuleset(name) });
  }
  return arms;
}

export function buildLaunch(
  mainClass: string,
  gameArgs: MojangArgValue[],
  jvmArgs: MojangArgValue[],
): LaunchParts {
  const jvm = parseValset(jvmArgs);
  const game = parseValset(gameArgs);
  const main: Val = { rules: [], value: [mainClass] };
  const launch: Launch = {
    command: '${java_bin}',
    workdir: './',
    args: [...jvm, main, ...game],
    envs: {},
  };
  return { launch, jvmArgs: jvm, mainClass: main, gameArgs: game };
}
