/**
 * `@opys/minecraft-serverlist` — the multiplayer server list, generated at
 * build time and carried by the manifest as a blob.
 *
 * Encoding `servers.dat`, grouping entries by ruleset and building the
 * artifacts are the `opys-minecraft-serverlist` crate's and are tested there.
 * What is left here is the typed surface and the plugin closure. The
 * codegen'd `.d.ts` types the return value as `Json` (≈ unknown), so the
 * wrapper carries one `as`-cast at the boundary. No `as unknown as`.
 */
import {
  definePlugin,
  type ChainablePlugin,
  type Contribution,
  type RulesetInput,
} from '@opys/dev';
import * as napi from '@opys/minecraft-serverlist-binding';

export interface ServerEntry {
  name: string;
  ip: string;
  /** Ruleset that gates this entry — omit or pass `[]` for always-on. */
  rules?: RulesetInput;
}

export interface ServerlistOptions {
  /** Where the generated `servers.dat` lands. Defaults to {@link DEFAULT_PATH}. */
  path?: string;
}

/** Where the list goes unless `path` says otherwise. */
export const DEFAULT_PATH: string = napi.defaultServerlistPath();

/**
 * A `servers.dat` holding `servers`. Entries that carry rules are split out:
 * each distinct ruleset gets its own file at the same path, installed only
 * where those rules hold. No entries at all is still a file — an empty list.
 */
export function serverlist(
  servers: ServerEntry[],
  options: ServerlistOptions = {},
): ChainablePlugin {
  return definePlugin({
    name: 'serverlist',
    build() {
      const output = napi.buildServerlist(servers, options) as {
        contribution: Contribution;
      };
      return output.contribution;
    },
  });
}
