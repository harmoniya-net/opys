/**
 * `@opys/dgpuj` — the [dgpuj](https://github.com/harmoniya-net/dgpuj)
 * launcher. It forces the discrete GPU on hybrid-graphics systems, then runs
 * the JVM in-process: a near drop-in for `java`, usable as the launch
 * `command` on every platform (it forces the dGPU on Windows and Linux and is
 * a harmless passthrough on macOS).
 *
 * Behaviour lives in the `opys-dgpuj` crate and reaches JS through
 * `@opys/dgpuj-binding`; this module is the typed surface over it. The
 * codegen'd binding types everything as `Json` (≈ `unknown`), so each wrapper
 * carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * What stays here is `dgpuj()` itself: a closure the build engine calls with a
 * `BuildContext`, so the plugin wrapper — and its `ctx.log` — is JS.
 */

import * as napi from '@opys/dgpuj-binding';
import {
  definePlugin,
  type ChainablePlugin,
  type Contribution,
} from '@opys/dev';
import type { Artifact, OsArch, OsName, ValDefs } from '@opys/core';

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-dgpuj` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** One build target `dgpuj` publishes a release archive for. */
export interface DgpujPlatform {
  /** opys OS name. */
  readonly os: OsName;
  /** opys CPU arch. */
  readonly arch: OsArch;
  /** Rust target triple embedded in the release asset name. */
  readonly target: string;
  /** Archive container the asset ships in. */
  readonly ext: 'tar.gz' | 'zip';
  /** Binary name inside the archive (and on disk after extraction). */
  readonly bin: 'dgpuj' | 'dgpuj.exe';
}

/** A release asset, as GitHub's API spells it. */
export interface DgpujReleaseAsset {
  readonly name: string;
  readonly size: number;
  readonly browser_download_url: string;
  readonly digest?: string;
}

/** The resolved GitHub release, as GitHub's API spells it. */
export interface DgpujRelease {
  readonly tag_name: string;
  readonly prerelease: boolean;
  readonly draft: boolean;
  readonly published_at: string;
  readonly assets: DgpujReleaseAsset[];
}

export interface DgpujOptions {
  /** Release to use: `'latest'` (default), `'prerelease'`, or an exact tag (`'v0.3.0'`). */
  readonly version?: string;
  /** Override the platform set (default {@link DEFAULT_PLATFORMS}). */
  readonly platforms?: readonly DgpujPlatform[];
  /** Source repo `owner/name` (default {@link DEFAULT_REPO}). */
  readonly repo?: string;
  /** GitHub token to raise API rate limits. */
  readonly token?: string;
  /** GitHub API base, when it is not the public one. */
  readonly apiBase?: string;
}

export interface DgpujTemplate {
  /** Per-target release archives, OS+arch-scoped, each extracting the binary. */
  readonly artifacts: Artifact[];
  /** `dgpuj_dir` + per-OS `dgpuj_bin` — spread into your loader's vars. */
  readonly vars: ValDefs;
  /** The resolved GitHub release. */
  readonly release: DgpujRelease;
}

/** Source repo for the `dgpuj` launcher releases. */
export const DEFAULT_REPO = napi.defaultDgpujRepo();

/** dgpuj's published targets — Windows/Linux/macOS × x86_64/aarch64. */
export const DEFAULT_PLATFORMS =
  napi.defaultDgpujPlatforms() as readonly DgpujPlatform[];

// ──────────────────────────────────────────────────────────────────────────
// Network
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve a `dgpuj` release and shape it into opys artifacts + vars.
 *
 * Each platform's archive (`dgpuj-<target>.{tar.gz,zip}`) becomes its own
 * OS+arch-scoped {@link Artifact} that downloads into `${dgpuj_dir}` and
 * extracts the single binary beside it — only the archive matching the launch
 * platform installs. The per-OS `dgpuj_bin` var points at that binary.
 */
export async function resolveDgpuj(
  options: DgpujOptions = {},
): Promise<DgpujTemplate> {
  return (await napi.resolveDgpuj(options)) as DgpujTemplate;
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

/**
 * Provision the `dgpuj` launcher.
 *
 * Solely owns `dgpuj_dir` / `dgpuj_bin`, and exposes two launch groups:
 *   - `bin`  — the launcher binary (the `command`).
 *   - `home` — `--dgpuj-home ${java_home}`, so it locates the JVM provisioned
 *     by `@opys/java`. Prepend it to `args` before the usual JVM args; leave
 *     it out if you wire the JVM location yourself.
 *
 * ```js
 * import { dgpuj } from '@opys/dgpuj';
 * // plugins: [forge('1.20.1-best'), java('17'), dgpuj()]
 * command: '@dgpuj.bin',
 * args: [
 *   '@dgpuj.home', '@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs',
 * ],
 * ```
 */
export function dgpuj(
  options: DgpujOptions = {},
): ChainablePlugin<'dgpuj', 'bin' | 'home'> {
  return definePlugin({
    name: 'dgpuj',
    async build(ctx) {
      const built = (await napi.buildDgpuj(options)) as {
        output: { contribution: Contribution<'bin' | 'home'> };
        release: DgpujRelease;
      };
      const { contribution } = built.output;
      ctx.log(
        'dgpuj',
        `${built.release.tag_name} (${contribution.artifacts?.length ?? 0} target(s))`,
      );
      return contribution;
    },
  });
}
