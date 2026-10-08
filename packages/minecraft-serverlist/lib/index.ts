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
  pluginOptions,
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
  /** The entries, in the order the game lists them. */
  servers: ServerEntry[];
  /** Where the generated `servers.dat` lands. Defaults to {@link DEFAULT_PATH}. */
  to?: string;
}

/** Where the list goes unless `to` says otherwise. */
export const DEFAULT_PATH: string = napi.defaultServerlistPath();

/**
 * A `servers.dat` holding `servers`. Entries that carry rules are split out:
 * each distinct ruleset gets its own file at the same path, installed only
 * where those rules hold. No entries at all is still a file — an empty list.
 */
export function serverlist(
  options: ServerlistOptions,
): ChainablePlugin<'serverlist', never> {
  const { servers, to } = pluginOptions(
    "serverlist({ servers: [{ name: 'Mine', ip: 'play.example.com' }] })",
    options,
  );
  return definePlugin({
    name: 'serverlist',
    build() {
      const output = napi.buildServerlist(
        servers,
        // The crate's name for it; `to` is what every plugin calls a place.
        to === undefined ? {} : { path: to },
      ) as {
        contribution: Contribution<never>;
      };
      return output.contribution;
    },
  });
}
