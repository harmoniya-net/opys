/**
 * `@opys/cleanroom` — the Cleanroom loader, a Minecraft 1.12.2 Forge successor
 * on a modern JVM.
 *
 * Behaviour lives in the `opys-cleanroom` crate and reaches JS through
 * `@opys/cleanroom-binding`; this module is the typed surface over it. The
 * codegen'd binding types everything as `Json` (≈ `unknown`), so each wrapper
 * carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * What stays here is the half that cannot cross: `cleanroom()` is a closure
 * the build engine calls with a `BuildContext`, so the plugin wrapper — and
 * its `ctx.log` — is JS. Everything it wraps is one native call.
 *
 * There is no installer to open and no GitHub listing to page through. Every
 * Cleanroom release is published ahead of time as a complete version JSON, so
 * resolving one is an index lookup and the vanilla mapping — and, unlike
 * `@opys/forge` and `@opys/neoforge`, nothing runs on the launching machine
 * before the game does.
 */

import * as napi from '@opys/cleanroom-binding';
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
export const DEFAULT_CLEANROOM_INDEX = napi.defaultCleanroomIndex();

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-cleanroom` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** What to resolve. */
export interface CleanroomOptions {
  /**
   * Libraries to run with beside the version's own; see {@link ExtraLibrary}.
   */
  readonly libraries?: readonly ExtraLibrary[];
  /**
   * Accepts:
   *   - a Minecraft version: `1.12.2` (its `best` release)
   *   - an alias: `1.12.2-latest` | `1.12.2-recommended` | `1.12.2-best`
   *   - a full Cleanroom release tag: `0.6.13-alpha`
   */
  readonly version: string;
  /** Document index base URL. Default: {@link DEFAULT_CLEANROOM_INDEX}. */
  readonly source?: string;
}

/** A Minecraft version paired with the concrete Cleanroom release chosen for it. */
export interface CleanroomRelease {
  /** Minecraft version. `1.12.2`, for every release so far. */
  readonly minecraft: string;
  /** Cleanroom release tag, e.g. `0.6.13-alpha`. */
  readonly cleanroom: string;
  /** Direct URL to that release's version document. */
  readonly documentUrl: string;
}

/** Everything a Cleanroom release contributes — the game included. */
export interface CleanroomTemplate extends LaunchParts {
  /** The client jar, the assets, and every library the document lists. */
  readonly artifacts: Artifact[];
  /** Where the blobs among `artifacts` are kept; set only by a local library. */
  readonly blobs?: Blobs;
  readonly vars: ValDefs;
  /**
   * Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
   * plugin stacked on top of Cleanroom can rebuild it with its own libraries.
   */
  readonly classpath: ConditionalVal[];
}

// ──────────────────────────────────────────────────────────────────────────
// Network
// ──────────────────────────────────────────────────────────────────────────

/** Resolve Cleanroom: pick the release, read its published document, map it. */
export async function resolveCleanroom(
  options: CleanroomOptions,
): Promise<CleanroomTemplate> {
  return (await napi.resolveCleanroom(options)) as CleanroomTemplate;
}

/** Resolve a version string, alias or release tag against the document index. */
export async function resolveCleanroomVersion(
  input: string,
  source: string = DEFAULT_CLEANROOM_INDEX,
): Promise<CleanroomRelease> {
  return (await napi.resolveCleanroomVersion(
    input,
    source,
  )) as CleanroomRelease;
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

/** Cleanroom — a 1.12.2 Forge successor. */
export function cleanroom(
  options: CleanroomOptions,
): ChainablePlugin<'cleanroom', LoaderGroups> {
  const { version } = pluginOptions(
    "cleanroom({ version: '1.12.2' })",
    options,
  );
  return definePlugin({
    name: 'cleanroom',
    async build(ctx) {
      const t = await resolveCleanroom(
        withLibraryFiles(options, ctx.configDir),
      );
      ctx.log('cleanroom', `resolved ${version}`);
      return {
        artifacts: t.artifacts,
        blobs: t.blobs,
        vars: t.vars,
        launch: launchGroups(t),
      };
    },
  });
}
