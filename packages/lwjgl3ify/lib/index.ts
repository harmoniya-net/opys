/**
 * `@opys/lwjgl3ify` — lwjgl3ify, Forge 1.7.10 on LWJGL 3 and a current JVM.
 *
 * Behaviour lives in the `opys-lwjgl3ify` crate and reaches JS through
 * `@opys/lwjgl3ify-binding`; this module is the typed surface over it. The
 * codegen'd binding types everything as `Json` (≈ `unknown`), so each wrapper
 * carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * What stays here is the half that cannot cross: `lwjgl3ify()` is a closure
 * the build engine calls with a `BuildContext`, so the plugin wrapper — and
 * its `ctx.log` — is JS. Everything it wraps is one native call.
 *
 * The version comes from a published document, as for the rest of the loader
 * family. The two jars that have to sit in `mods/` — lwjgl3ify itself and
 * UniMixins — do not, because a version JSON cannot name them; the crate
 * reads those off GitHub Releases.
 */

import * as napi from '@opys/lwjgl3ify-binding';
import {
  definePlugin,
  pluginOptions,
  launchGroups,
  type ChainablePlugin,
  type LoaderGroups,
} from '@opys/dev';
import type { Artifact, ConditionalVal, ValDefs } from '@opys/core';
import type { LaunchParts } from '@opys/minecraft-vanilla';

/** The canonical document index base URL. */
export const DEFAULT_LWJGL3IFY_INDEX = napi.defaultLwjgl3ifyIndex();

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-lwjgl3ify` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** Which UniMixins to install. */
export interface UnimixinsOptions {
  /** A tag, `'latest'`, or `'prerelease'`. Default `'latest'`. */
  readonly version?: string;
  /** GitHub repo `owner/name`. Default: `LegacyModdingMC/UniMixins`. */
  readonly repo?: string;
}

/** What to resolve. */
export interface Lwjgl3ifyOptions {
  /**
   * Accepts:
   *   - a Minecraft version: `1.7.10` (its `best` release)
   *   - an alias: `1.7.10-latest` | `1.7.10-recommended` | `1.7.10-best`
   *   - a full lwjgl3ify release tag: `3.0.37`
   */
  readonly version: string;
  /** Document index base URL. Default: {@link DEFAULT_LWJGL3IFY_INDEX}. */
  readonly source?: string;
  /** GitHub repo the mod jar is released from. Default: `GTNewHorizons/lwjgl3ify`. */
  readonly repo?: string;
  /** GitHub token, for a higher rate limit while looking the mod jars up. */
  readonly token?: string;
  /** GitHub API base, when it is not the public one. */
  readonly apiBase?: string;
  /**
   * UniMixins, which lwjgl3ify cannot load without — its coremod implements
   * `IEarlyMixinLoader`. `false` opts out, for a pack that ships its own
   * mixin runtime.
   */
  readonly unimixins?: UnimixinsOptions | false;
}

/** A Minecraft version paired with the concrete lwjgl3ify release chosen for it. */
export interface Lwjgl3ifyRelease {
  /** Minecraft version. `1.7.10`, for every release so far. */
  readonly minecraft: string;
  /** lwjgl3ify release tag, e.g. `3.0.37`. */
  readonly lwjgl3ify: string;
  /** Direct URL to that release's version document. */
  readonly documentUrl: string;
}

/** Everything an lwjgl3ify release contributes — the game included. */
export interface Lwjgl3ifyTemplate extends LaunchParts {
  /** The client jar, the assets, every library, then the jars for `mods/`. */
  readonly artifacts: Artifact[];
  readonly vars: ValDefs;
  /**
   * Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
   * plugin stacked on top of lwjgl3ify can rebuild it with its own libraries.
   */
  readonly classpath: ConditionalVal[];
}

// ──────────────────────────────────────────────────────────────────────────
// Network
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve lwjgl3ify: pick the release, read its published document, map it,
 * then add the jars that go in `mods/`.
 */
export async function resolveLwjgl3ify(
  options: Lwjgl3ifyOptions,
): Promise<Lwjgl3ifyTemplate> {
  return (await napi.resolveLwjgl3ify(options)) as Lwjgl3ifyTemplate;
}

/** Resolve a version string, alias or release tag against the document index. */
export async function resolveLwjgl3ifyVersion(
  input: string,
  source: string = DEFAULT_LWJGL3IFY_INDEX,
): Promise<Lwjgl3ifyRelease> {
  return (await napi.resolveLwjgl3ifyVersion(
    input,
    source,
  )) as Lwjgl3ifyRelease;
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

/** lwjgl3ify — Forge 1.7.10 on a modern LWJGL 3 runtime. */
export function lwjgl3ify(
  options: Lwjgl3ifyOptions,
): ChainablePlugin<'lwjgl3ify', LoaderGroups> {
  const { version } = pluginOptions(
    "lwjgl3ify({ version: '1.7.10' })",
    options,
  );
  return definePlugin({
    name: 'lwjgl3ify',
    async build(ctx) {
      const t = await resolveLwjgl3ify(options);
      ctx.log('lwjgl3ify', `resolved ${version}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}
