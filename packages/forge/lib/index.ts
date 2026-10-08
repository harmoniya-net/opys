/**
 * `@opys/forge` — the Forge mod loader.
 *
 * Behaviour lives in the `opys-forge` crate and reaches JS through
 * `@opys/forge-binding`; this module is the typed surface over it. The
 * codegen'd binding types everything as `Json` (≈ `unknown`), so each wrapper
 * carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * What stays here is the half that cannot cross: `forge()` is a closure the
 * build engine calls with a `BuildContext`, so the plugin wrapper — and its
 * `ctx.log` — is JS. Everything it wraps is one native call.
 *
 * There is no era to choose between. Every Forge build is published as an
 * ordinary Mojang `inheritsFrom` document, so a 1.1 jar mod and a 1.21
 * processor install take the same path — which is why this file is the same
 * shape as `@opys/fabric`.
 */

import * as napi from '@opys/forge-binding';
import {
  definePlugin,
  pluginOptions,
  launchGroups,
  withLibraryFiles,
  type ExtraLibrary,
  type ChainablePlugin,
  type LoaderGroups,
} from '@opys/dev';
import type { Artifact, ConditionalVal, ValDefs, Blobs } from '@opys/core';
import type { LaunchParts } from '@opys/minecraft-vanilla';

/** The canonical document index base URL. */
export const DEFAULT_FORGE_INDEX = napi.defaultForgeIndex();

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-forge` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** What to resolve. */
export interface ForgeOptions {
  /**
   * Libraries to run with beside the version's own; see {@link ExtraLibrary}.
   */
  readonly libraries?: readonly ExtraLibrary[];
  /**
   * Accepts:
   *   - a Minecraft version: `1.20.1` (its `best` build)
   *   - an alias: `1.20.1-latest` | `1.20.1-recommended` | `1.20.1-best`
   *   - a full Forge build id: `1.20.1-47.4.10`
   */
  readonly version: string;
  /** Document index base URL. Default: {@link DEFAULT_FORGE_INDEX}. */
  readonly source?: string;
  /**
   * URL of the Mojang version manifest, when it is not Mojang's own — a
   * mirror, or a stand-in server under test.
   */
  readonly manifestBase?: string;
}

/** A Minecraft version paired with the concrete Forge build chosen for it. */
export interface ForgeRelease {
  /** Minecraft version, e.g. `1.20.1`. */
  readonly minecraft: string;
  /** Forge build id, e.g. `1.20.1-47.4.10`. */
  readonly forge: string;
  /** Direct URL to that build's version document. */
  readonly documentUrl: string;
}

/** Everything a Forge build plus its vanilla base contributes. */
export interface ForgeTemplate extends LaunchParts {
  /** Vanilla artifacts followed by Forge's own libraries. */
  readonly artifacts: Artifact[];
  /** Where the blobs among `artifacts` are kept; set only by a local library. */
  readonly blobs?: Blobs;
  readonly vars: ValDefs;
  /**
   * Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
   * plugin stacked on top of Forge can rebuild it with its own libraries.
   */
  readonly classpath: ConditionalVal[];
}

// ──────────────────────────────────────────────────────────────────────────
// Network
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve Forge: pick the build, read its published version document, fetch
 * the vanilla version it inherits from, then fold the two together.
 */
export async function resolveForge(
  options: ForgeOptions,
): Promise<ForgeTemplate> {
  return (await napi.resolveForge(options)) as ForgeTemplate;
}

/** Resolve a version string, alias or build id against the document index. */
export async function resolveForgeVersion(
  input: string,
  source: string = DEFAULT_FORGE_INDEX,
): Promise<ForgeRelease> {
  return (await napi.resolveForgeVersion(input, source)) as ForgeRelease;
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

/** Forge mod loader — every version, from 1.1 to current. */
export function forge(
  options: ForgeOptions,
): ChainablePlugin<'forge', LoaderGroups> {
  const { version } = pluginOptions("forge({ version: '1.20.1' })", options);
  return definePlugin({
    name: 'forge',
    async build(ctx) {
      const t = await resolveForge(withLibraryFiles(options, ctx.configDir));
      ctx.log('forge', `resolved ${version}`);
      return {
        artifacts: t.artifacts,
        blobs: t.blobs,
        vars: t.vars,
        launch: launchGroups(t),
      };
    },
  });
}
