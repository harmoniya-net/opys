import type { Artifact, ValDefs, Val, Valset } from '@lanka/core';

/** Build-time context handed to every plugin's `build` hook. */
export interface BuildContext {
  /** Sanctioned build-time logging channel; auto-prefixed by plugin name. */
  log: (scope: string, message: string) => void;
  /** Absolute directory of `lanka.config.mjs` — anchor for relative paths. */
  configDir: string;
  /** Value of `lanka build --mode <m>`; empty string when unset. */
  mode: string;
}

/**
 * Named launch fragments a plugin exposes for the config's `command`/`args`
 * accessor functions — e.g. `{ jvmArgs, mainClass, gameArgs }` or `{ bin }`.
 */
export type LaunchGroups = Record<string, Valset | Val | string>;

/** What a plugin's `build` hook returns. */
export interface Contribution {
  /** Artifacts to download/copy/extract. */
  artifacts?: Artifact[];
  /** Manifest vars this plugin owns. */
  vars?: ValDefs;
  /** Named launch fragments, exposed to the config's accessor functions. */
  launch?: LaunchGroups;
}

/**
 * A lanka plugin — a pure-to-construct, bundler-style hook object. The
 * constructor (`forge('1.20.1-best')`, …) does zero I/O; all network/fs work
 * happens inside `build`, which the engine drives.
 */
export interface LankaPlugin {
  name: string;
  build(ctx: BuildContext): Promise<Contribution> | Contribution;
}

/** Identity helper for authoring a plugin with inferred types. */
export function definePlugin(plugin: LankaPlugin): LankaPlugin {
  return plugin;
}
