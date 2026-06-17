import {
  type Artifact,
  type ValDefs,
  type ConditionalVal,
  sourceUrl,
  extractDump,
} from '@opys/core';
import type { OsName, OsArch, Ruleset } from '@opys/core';
import {
  resolveOpenjdk,
  type JavaPlatform,
  type JavaRelease,
  type ResolveOpenjdkOptions,
} from './resolver';

export interface JavaOptions {
  /**
   * OpenJDK version. Accepts:
   *   - Major:        `'21'` — resolves to the latest GA for that major.
   *   - Full version: `'21.0.11+10'` — exact Adoptium release name (`jdk-…` prefix and `-LTS` suffix are tolerated).
   */
  version: string;
  /** Distribution to fetch from. Only `'openjdk'` (Eclipse Temurin) is supported today. */
  vendor?: 'openjdk';
  /** Override the platform set. Default covers linux/osx/windows × x86_64+aarch64. */
  platforms?: readonly JavaPlatform[];
  /** Optional override for the Adoptium API base URL. */
  apiBase?: string;
}

export interface JavaTemplate {
  /** Per-platform JDK archives, scoped by OS+arch rules and extracted on first install. */
  artifacts: Artifact[];
  /** `java_home` and `java_bin` per OS — spread into your loader's vars. */
  vars: ValDefs;
  /** Resolved release metadata. */
  release: JavaRelease;
}

function osArchRuleset(os: OsName, arch: OsArch): Ruleset {
  return [
    { action: 'allow', os: { name: os } },
    { action: 'allow', os: { arch } },
  ];
}

function osRuleset(os: OsName): Ruleset {
  return [{ action: 'allow', os: { name: os } }];
}

/**
 * Windows ships both `java.exe` (console subsystem) and `javaw.exe` (windows
 * subsystem — no console). Emit two mutually-exclusive `java_bin` arms gated
 * on the `java_console` feature: `javaw.exe` by default so a launched game
 * never spawns a stray console window, and `java.exe` when `java_console` is
 * enabled at install/launch (e.g. `opys launch --feature java_console`) to
 * watch stdout/stderr. The ruleset evaluator is pure AND, so for any feature
 * state exactly one arm is active.
 */
function windowsBinArms(): ConditionalVal[] {
  return [
    {
      value: '${java_home}/bin/javaw.exe',
      rules: [
        { action: 'allow', os: { name: 'windows' } },
        { action: 'disallow', features: { java_console: true } },
      ],
    },
    {
      value: '${java_home}/bin/java.exe',
      rules: [
        { action: 'allow', os: { name: 'windows' } },
        { action: 'allow', features: { java_console: true } },
      ],
    },
  ];
}

/**
 * Build a opys template fragment that auto-installs an OpenJDK runtime
 * (Eclipse Temurin) and exposes `${java_home}` + `${java_bin}` vars.
 *
 * Each platform's archive is emitted as its own `Artifact` with an
 * OS+arch rule, so only the matching binary downloads at install time.
 * The archive is extracted into `${root}/runtimes/jdk-<major>/`, with
 * the Adoptium release directory as the immediate child (e.g.
 * `jdk-21.0.11+10/`). On macOS, `${java_home}` includes the
 * `/Contents/Home` suffix that Mac JDK bundles use.
 *
 * On Windows, `${java_bin}` defaults to `javaw.exe` (no console window);
 * enable the `java_console` feature to switch it to `java.exe` — see
 * `windowsBinArms`.
 *
 * Spread the result into your loader's vars + artifacts:
 *
 * ```ts
 * const jav = await resolveJava({ version: '21' });
 * return {
 *   artifacts: [lw.artifacts, jav.artifacts],
 *   vars: { ...lw.vars, ...jav.vars },
 *   command: lw.command, // command.command is `${java_bin}` already
 * };
 * ```
 */
export async function resolveJava(options: JavaOptions): Promise<JavaTemplate> {
  if (options.vendor && options.vendor !== 'openjdk') {
    throw new Error(
      `@opys/java: vendor '${options.vendor}' is not yet supported (only 'openjdk').`,
    );
  }
  const release = await resolveOpenjdk(options.version, {
    platforms: options.platforms,
    apiBase: options.apiBase,
  } satisfies ResolveOpenjdkOptions);

  // JDK runtimes install under the `java_runtime_dir` var (default
  // `${root}/runtimes`) — override it in the config's `vars` to relocate.
  // Archives download directly into it: a sibling of, never nested inside,
  // the extract target, so no `.cache` special-casing is needed.
  const javaRoot = `\${java_runtime_dir}/jdk-${release.major}`;

  const artifacts: Artifact[] = release.binaries.map((b) => ({
    path: `\${java_runtime_dir}/${b.filename}`,
    source: sourceUrl(b.url),
    size: b.size,
    rules: osArchRuleset(b.platform.os, b.platform.arch),
    integrity: { sha256: b.sha256 },
    extract: [extractDump(javaRoot)],
  }));

  // `java_home` only varies by OS (Linux/Windows have no suffix; macOS
  // bundles add `/Contents/Home`). Both x86_64 and aarch64 archives
  // extract to the same top-level directory, so we don't need to split
  // by arch here.
  const seenOses = new Set(release.binaries.map((b) => b.platform.os));
  const javaHomeArms: ConditionalVal[] = [];
  const javaBinArms: ConditionalVal[] = [];
  for (const os of seenOses) {
    const platform = release.binaries.find(
      (b) => b.platform.os === os,
    )!.platform;
    const home = `${javaRoot}/${release.extractDir}${platform.homeSuffix}`;
    javaHomeArms.push({ value: home, rules: osRuleset(os) });
    if (os === 'windows') {
      javaBinArms.push(...windowsBinArms());
    } else {
      javaBinArms.push({
        value: `\${java_home}/bin/java`,
        rules: osRuleset(os),
      });
    }
  }

  const vars: ValDefs = {
    java_runtime_dir: '${root}/runtimes',
    java_home: javaHomeArms,
    java_bin: javaBinArms,
  };

  return { artifacts, vars, release };
}
