import {
  type Artifact,
  type ValDefs,
  type ConditionalVal,
  type OsName,
  type Ruleset,
  sourceUrl,
  extractScan,
} from '@opys/core';
import { DEFAULT_PLATFORMS, macHomeSuffix, type Platform } from './platforms';
import { resolveTemurin } from './temurin';
import { resolveZulu } from './zulu';
import { resolveGraalvm } from './graalvm';
import type { VendorRelease } from './vendor';

export type JavaVendor = 'temurin' | 'zulu' | 'graalvm';

export interface JavaOptions {
  /**
   * JDK version. Accepts:
   *   - Major:        `'21'` — resolves to the latest GA for that major.
   *   - Full version: vendor-specific exact build (see each resolver).
   */
  version: string;
  /** Distribution to fetch from. Defaults to `'temurin'` (Eclipse Adoptium). */
  vendor?: JavaVendor;
  /** Override the platform set. Default covers linux/osx/windows × x86_64+aarch64. */
  platforms?: readonly Platform[];
  /** API base URL override — `temurin` (Adoptium) and `zulu` (Azul) only. */
  apiBase?: string;
  /** GitHub token for higher rate limits — `graalvm` only. */
  token?: string;
}

export interface JavaTemplate {
  /** Per-platform JDK archives, scoped by OS+arch rules and extracted on first install. */
  artifacts: Artifact[];
  /** `java_home` and `java_bin` per OS — spread into your loader's vars. */
  vars: ValDefs;
  /** Resolved release metadata. */
  release: VendorRelease;
}

function osArchRuleset(os: OsName, arch: Platform['arch']): Ruleset {
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
 * watch stdout/stderr. The ruleset evaluator ANDs across an arm's rules, so
 * for any feature state exactly one arm is active.
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

async function resolveRelease(options: JavaOptions): Promise<VendorRelease> {
  const vendor = options.vendor ?? 'temurin';
  const platforms = options.platforms ?? DEFAULT_PLATFORMS;
  switch (vendor) {
    case 'temurin':
      return resolveTemurin(options.version, {
        platforms,
        apiBase: options.apiBase,
      });
    case 'zulu':
      return resolveZulu(options.version, {
        platforms,
        apiBase: options.apiBase,
      });
    case 'graalvm':
      return resolveGraalvm(options.version, {
        platforms,
        token: options.token,
      });
    default: {
      const _exhaustive: never = vendor;
      throw new Error(
        `@opys/java: vendor '${String(_exhaustive)}' is not supported (expected 'temurin', 'zulu', or 'graalvm').`,
      );
    }
  }
}

/**
 * Build a opys template fragment that auto-installs a JDK runtime and
 * exposes `${java_home}` + `${java_bin}` vars.
 *
 * Each platform's archive is emitted as its own `Artifact` with an OS+arch
 * rule, so only the matching binary downloads at install time. Archives
 * extract into `${root}/runtimes/jdk-<major>/` with the archive's own
 * top-level directory glob-stripped regardless of what it's named — some
 * vendors' archives embed a build identifier that isn't
 * knowable at resolve time (see `graalvm.ts`), so every vendor is
 * extracted the same flattened way rather than special-casing the ones
 * whose directory name happens to be predictable. On macOS, `${java_home}`
 * includes the `/Contents/Home` suffix that Mac JDK bundles use.
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
  const release = await resolveRelease(options);

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
    ...(b.sha256 ? { integrity: { sha256: b.sha256 } } : {}),
    ...(b.discovery ? { discovery: b.discovery } : {}),
    extract: [extractScan('*', javaRoot, { strip: ['*/'] })],
  }));

  // `java_home` only varies by OS (Linux/Windows have no suffix; macOS
  // bundles add `/Contents/Home`) now that extraction always flattens the
  // archive's own top-level directory — arch never enters into it.
  const seenOses = new Set(release.binaries.map((b) => b.platform.os));
  const javaHomeArms: ConditionalVal[] = [];
  const javaBinArms: ConditionalVal[] = [];
  for (const os of seenOses) {
    javaHomeArms.push({
      value: `${javaRoot}${macHomeSuffix(os)}`,
      rules: osRuleset(os),
    });
    if (os === 'windows') {
      javaBinArms.push(...windowsBinArms());
    } else {
      javaBinArms.push({
        value: '${java_home}/bin/java',
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
