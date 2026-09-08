/**
 * `@opys/fabric` — the Fabric mod loader.
 *
 * Behaviour lives in the `opys-fabric` crate and reaches JS through
 * `@opys/fabric-binding`; this module is the typed surface over it. The
 * codegen'd binding types everything as `Json` (≈ `unknown`), so each wrapper
 * carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * What stays here is the half that cannot cross: `fabric()` is a closure the
 * build engine calls with a `BuildContext`, so the plugin wrapper — and its
 * `ctx.log` — is JS. Everything it wraps is one native call.
 */

import * as napi from '@opys/fabric-binding';
import { definePlugin, launchGroups, type ChainablePlugin } from '@opys/dev';
import type { Artifact, ConditionalVal, ValDefs } from '@opys/core';
import type { LaunchParts } from '@opys/minecraft-vanilla';

/** The canonical Fabric Meta base URL. */
export const DEFAULT_FABRIC_META = napi.defaultFabricMeta();

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-fabric` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** What to resolve. */
export interface FabricOptions {
  /** Minecraft (game) version, e.g. `1.21.4`. */
  readonly version: string;
  /**
   * Fabric loader version, e.g. `0.16.10`. Omit for the latest stable loader
   * build that targets `version`.
   */
  readonly loader?: string;
  /** Fabric Meta base URL. Default: {@link DEFAULT_FABRIC_META}. */
  readonly source?: string;
  /**
   * URL of the Mojang version manifest, when it is not Mojang's own — a
   * mirror, or a stand-in server under test.
   */
  readonly manifestBase?: string;
}

/** A game version paired with the concrete loader build that targets it. */
export interface FabricRelease {
  /** Minecraft (game) version, e.g. `1.21.4`. */
  readonly gameVersion: string;
  /** Fabric loader version, e.g. `0.16.10`. */
  readonly loaderVersion: string;
  /** Direct URL to the launcher profile JSON on the Meta API. */
  readonly profileUrl: string;
}

/** Everything a Fabric profile plus its vanilla base contributes. */
export interface FabricTemplate extends LaunchParts {
  /** Vanilla artifacts followed by the loader's own libraries. */
  readonly artifacts: Artifact[];
  readonly vars: ValDefs;
  /**
   * Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
   * plugin stacked on top of Fabric can rebuild it with its own libraries.
   */
  readonly classpath: ConditionalVal[];
}

// ──────────────────────────────────────────────────────────────────────────
// Network
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve Fabric: pick the loader build, read its launcher profile, fetch the
 * vanilla version it inherits from, then fold the two together.
 */
export async function resolveFabric(
  options: FabricOptions,
): Promise<FabricTemplate> {
  return (await napi.resolveFabric(options)) as FabricTemplate;
}

/**
 * Resolve a game version (and optional loader) to a concrete Fabric release.
 * A pinned loader needs no request — the profile URL is built directly.
 */
export async function resolveFabricVersion(
  game: string,
  meta: string = DEFAULT_FABRIC_META,
  loader?: string,
): Promise<FabricRelease> {
  return (await napi.resolveFabricVersion(game, meta, loader)) as FabricRelease;
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fabric mod loader. `version` is the Minecraft version; the loader build is
 * resolved to the latest stable unless pinned via `opts.loader`.
 */
export function fabric(
  version: string,
  opts: Omit<FabricOptions, 'version'> = {},
): ChainablePlugin {
  return definePlugin({
    name: 'fabric',
    async build(ctx) {
      const t = await resolveFabric({ ...opts, version });
      ctx.log('fabric', `resolved ${version}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}
