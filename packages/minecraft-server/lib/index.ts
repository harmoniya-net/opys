/**
 * `@opys/minecraft-server` — a Minecraft server, as one plugin.
 *
 * A server is one jar: it fetches its own libraries the first time it is
 * started. So `server()` resolves a core to that jar, pins it, and says how
 * to start it. Which cores there are, and where each is asked, is the
 * `opys-minecraft-server` crate's and is tested there; this module is the
 * typed surface over it.
 *
 * What stays here is `server()` itself: the plugin closure, and a path made
 * absolute against the config's directory, which only this side knows.
 */

import { isAbsolute, resolve } from 'node:path';
import { minecraftServer as napi } from '@opys/binding';
import {
  definePlugin,
  pluginOptions,
  type BuildArtifact,
  type ChainablePlugin,
  type Contribution,
} from '@opys/dev';
import type { Artifact } from '@opys/core';

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-minecraft-server` options one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** A core that is looked up by version: the ones there is a list of. */
export type Core =
  'vanilla' | 'paper' | 'purpur' | 'fabric' | 'forge' | 'neoforge';

/**
 * Where each core is asked. Every field is a mirror; one left out is the
 * core's own address.
 */
export interface Apis {
  /** Mojang's version manifest, the document itself. */
  readonly mojang?: string;
  readonly paper?: string;
  readonly purpur?: string;
  readonly fabric?: string;
  /** Where Forge lists its builds. Its jars are on `forgeMaven`. */
  readonly forge?: string;
  readonly forgeMaven?: string;
  readonly neoforge?: string;
}

/** Every field a core is written with, across all of them. */
type CoreField =
  | 'vanilla'
  | 'paper'
  | 'purpur'
  | 'fabric'
  | 'forge'
  | 'neoforge'
  | 'jar'
  | 'installer'
  | 'build'
  | 'loader';

/**
 * `T` and none of the other cores' fields. A union alone would let
 * `{ paper, loader }` through, since `loader` is a field of some member.
 */
type Only<T> = T & { readonly [K in Exclude<CoreField, keyof T>]?: never };

/**
 * Which server: the field that names the core holds its version. A core
 * takes its own fields and no other's, so `{ paper: '1.21.1', loader }` is
 * a compile error and, from plain JavaScript, a refusal at build.
 */
export type ServerCore =
  /** Mojang's own. */
  | Only<{ readonly vanilla: string }>
  /** Paper. No `build` is its newest stable one. */
  | Only<{ readonly paper: string; readonly build?: string | number }>
  /** Purpur. No `build` is its newest. */
  | Only<{ readonly purpur: string; readonly build?: string | number }>
  /** Fabric. No `loader` is the newest stable one. */
  | Only<{ readonly fabric: string; readonly loader?: string }>
  /** Forge, by Minecraft version. No `build` is the one Forge recommends. */
  | Only<{ readonly forge: string; readonly build?: string }>
  /** NeoForge, by its own version. */
  | Only<{ readonly neoforge: string }>
  /**
   * A server jar you have: a link, or a path beside the config. Spigot and
   * CraftBukkit come this way, since they are built on your machine.
   */
  | Only<{ readonly jar: string }>
  /**
   * An installer you have, of a fork of Forge or NeoForge: a link, or a
   * path. It is run on the server's machine, as theirs is.
   */
  | Only<{ readonly installer: string }>;

/**
 * What `server()` takes: a core, or none, which is Mojang's current
 * release.
 */
export type ServerOptions = (ServerCore | Only<object>) & {
  readonly apis?: Apis;
};

/** What a config resolves to. */
export interface ResolvedServer {
  /**
   * The core with nothing left to "the newest": put it in the config to
   * get this exact server again.
   */
  readonly pinned: ServerCore;
  /** What it is, in words: `Paper 1.21.1 build 133`. */
  readonly label: string;
  /** The server's own files, the jar first. */
  readonly files: readonly Artifact[];
}

/**
 * The feature that has an install write `eula.txt`.
 *
 * Agreeing to Mojang's EULA is for whoever runs the server, so it is said
 * where the server is installed: `opys launch --feature eula`, or `features`
 * from a config's `run`. A bundle never says it: a bundle is handed on, and
 * would then be agreeing for somebody else.
 */
export const EULA_FEATURE = napi.eulaFeature();

// ──────────────────────────────────────────────────────────────────────────
// The three questions
// ──────────────────────────────────────────────────────────────────────────

/**
 * The versions a core has a server for, newest first and stable only. They
 * are Minecraft versions, except NeoForge's, whose own version names a
 * build.
 */
export async function serverVersions(
  core: Core,
  apis?: Apis,
): Promise<string[]> {
  return (await napi.serverVersions(core, apis)) as string[];
}

/**
 * The builds a core has of one version, newest first: build numbers, or for
 * Fabric its loaders. Empty for `vanilla` and `neoforge`, where the version
 * is all there is to choose.
 */
export async function serverBuilds(
  core: Core,
  version: string,
  apis?: Apis,
): Promise<string[]> {
  return (await napi.serverBuilds(core, version, apis)) as string[];
}

/** Resolve a core down to its files, and to the exact core that names them. */
export async function resolveServer(
  options: ServerOptions = {},
): Promise<ResolvedServer> {
  return (await napi.resolveServer(options)) as ResolvedServer;
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

const isLink = (written: string) => /^https?:\/\//.test(written);

/** `options` with a path of the author's taken beside the config. */
function beside(configDir: string, options: ServerOptions): ServerOptions {
  const at = (written: string) =>
    isLink(written) || isAbsolute(written)
      ? written
      : resolve(configDir, written);
  if (options.jar !== undefined) return { ...options, jar: at(options.jar) };
  if (options.installer !== undefined)
    return { ...options, installer: at(options.installer) };
  return options;
}

type Groups = 'command' | 'jar' | 'args';

/**
 * A Minecraft server.
 *
 * Owns `root`, adds the server's files under it and, behind the `eula`
 * feature, `${root}/eula.txt`. Exposes three launch groups: `command`, the
 * `java` to run; `jar`, `-jar` and the jar; and `args`, `nogui`.
 *
 * ```js
 * import { server } from '@opys/minecraft-server';
 * // plugins: [server({ paper: '1.21.1' }), java({ version: '21' })]
 * command: '@server.command',
 * args: ['-Xmx4G', '@server.jar', '@server.args'],
 * workdir: '${root}',
 * ```
 */
export function server(
  options: ServerOptions = {},
): ChainablePlugin<'server', Groups> {
  pluginOptions("server({ paper: '1.21.1' })", options);
  return definePlugin({
    name: 'server',
    async build(ctx) {
      const built = (await napi.buildServer(
        beside(ctx.configDir, options),
      )) as {
        output: {
          contribution: Omit<Contribution<Groups>, 'artifacts'> & {
            artifacts: (Omit<BuildArtifact, 'source'> & {
              source: BuildArtifact['source'] | { bytes: string };
            })[];
          };
        };
        label: string;
      };
      ctx.log('server', built.label);
      const { contribution } = built.output;
      return {
        ...contribution,
        // What the crate made crosses as base64.
        artifacts: contribution.artifacts.map(
          ({ source, ...rest }): BuildArtifact =>
            'bytes' in source && typeof source.bytes === 'string'
              ? {
                  ...rest,
                  source: { bytes: Buffer.from(source.bytes, 'base64') },
                }
              : { ...rest, source: source as BuildArtifact['source'] },
        ),
      };
    },
  });
}
