/**
 * `@opys/neoforge` — the NeoForge mod loader.
 *
 * Behaviour lives in the `opys-neoforge` crate and reaches JS through
 * `@opys/neoforge-binding`; this module is the typed surface over it. The
 * codegen'd binding types everything as `Json` (≈ `unknown`), so each wrapper
 * carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * What stays here is the half that cannot cross: `neoforge()` is a closure the
 * build engine calls with a `BuildContext`, so the plugin wrapper — and its
 * `ctx.log` — is JS. Everything it wraps is one native call.
 *
 * There is no installer to open. Every NeoForge build is published ahead of
 * time as an ordinary Mojang `inheritsFrom` document, so resolving one is an
 * index lookup and a fold — the same path `@opys/forge` and `@opys/fabric`
 * take.
 */

import * as napi from '@opys/neoforge-binding';
import { definePlugin, launchGroups, type ChainablePlugin } from '@opys/dev';
import type { Artifact, ConditionalVal, ValDefs } from '@opys/core';
import type { LaunchParts } from '@opys/minecraft-vanilla';

/** The canonical document index base URL. */
export const DEFAULT_NEOFORGE_INDEX = napi.defaultNeoForgeIndex();

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-neoforge` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** What to resolve. */
export interface NeoForgeOptions {
  /**
   * Accepts:
   *   - a Minecraft version: `1.21.1` (its `best` build)
   *   - an alias: `1.21.1-latest` | `1.21.1-recommended` | `1.21.1-best`
   *   - a full NeoForge build id: `21.1.172`
   */
  readonly version: string;
  /** Document index base URL. Default: {@link DEFAULT_NEOFORGE_INDEX}. */
  readonly source?: string;
  /**
   * URL of the Mojang version manifest, when it is not Mojang's own — a
   * mirror, or a stand-in server under test.
   */
  readonly manifestBase?: string;
}

/** A Minecraft version paired with the concrete NeoForge build chosen for it. */
export interface NeoForgeRelease {
  /** Minecraft version, e.g. `1.21.1`. */
  readonly minecraft: string;
  /** NeoForge build id, e.g. `21.1.172`. */
  readonly neoforge: string;
  /** Direct URL to that build's version document. */
  readonly documentUrl: string;
}

/** Everything a NeoForge build plus its vanilla base contributes. */
export interface NeoForgeTemplate extends LaunchParts {
  /** Vanilla artifacts followed by NeoForge's own libraries. */
  readonly artifacts: Artifact[];
  readonly vars: ValDefs;
  /**
   * Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
   * plugin stacked on top of NeoForge can rebuild it with its own libraries.
   */
  readonly classpath: ConditionalVal[];
}

// ──────────────────────────────────────────────────────────────────────────
// Network
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve NeoForge: pick the build, read its published version document, fetch
 * the vanilla version it inherits from, then fold the two together.
 */
export async function resolveNeoForge(
  options: NeoForgeOptions,
): Promise<NeoForgeTemplate> {
  return (await napi.resolveNeoForge(options)) as NeoForgeTemplate;
}

/** Resolve a version string, alias or build id against the document index. */
export async function resolveNeoForgeVersion(
  input: string,
  source: string = DEFAULT_NEOFORGE_INDEX,
): Promise<NeoForgeRelease> {
  return (await napi.resolveNeoForgeVersion(input, source)) as NeoForgeRelease;
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

/** NeoForge mod loader. */
export function neoforge(
  version: string,
  opts: Omit<NeoForgeOptions, 'version'> = {},
): ChainablePlugin {
  return definePlugin({
    name: 'neoforge',
    async build(ctx) {
      const t = await resolveNeoForge({ ...opts, version });
      ctx.log('neoforge', `resolved ${version}`);
      return { artifacts: t.artifacts, vars: t.vars, launch: launchGroups(t) };
    },
  });
}
