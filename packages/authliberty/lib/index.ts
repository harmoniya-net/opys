/**
 * `@opys/authliberty` — AuthLiberty, a `-javaagent` that points Minecraft's
 * auth, account, session and services hosts somewhere else.
 *
 * Behaviour lives in the `opys-authliberty` crate and reaches JS through
 * `@opys/authliberty-binding`; this module is the typed surface over it. The
 * codegen'd binding types everything as `Json` (≈ `unknown`), so each wrapper
 * carries one `as`-cast at the boundary. No `as unknown as`.
 *
 * Two things stay here because they cannot cross. `authliberty()` is a
 * closure the build engine calls with a `BuildContext`. And `hosts` may be
 * written as a function, which is called once per server on this side and
 * handed over as the plain map it produces.
 */

import * as napi from '@opys/authliberty-binding';
import { definePlugin, type ChainablePlugin } from '@opys/dev';
import type { Artifact, Valset } from '@opys/core';

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror the `opys-authliberty` structs one-to-one.
// ──────────────────────────────────────────────────────────────────────────

/** Mojang server kind AuthLiberty's bytecode transformer can retarget. */
export type AuthLibertyServer = 'auth' | 'account' | 'session' | 'services';

/** Replacement hosts. A key left out stays on Mojang's host at runtime. */
export interface AuthLibertyHostMap {
  /** `-Dminecraft.api.auth.host` — Yggdrasil auth server (default `https://authserver.mojang.com`). */
  readonly auth?: string;
  /** `-Dminecraft.api.account.host` — account services (default `https://account.mojang.com`). */
  readonly account?: string;
  /** `-Dminecraft.api.session.host` — session/profile server (default `https://sessionserver.mojang.com`). */
  readonly session?: string;
  /** `-Dminecraft.api.services.host` — Minecraft Services API (default `https://api.minecraftservices.com`). */
  readonly services?: string;
}

/**
 * Per-server host overrides. Either a map, or a function called once per
 * server kind — return a URL to override, or `undefined` / an empty string to
 * leave that server on its Mojang default.
 */
export type AuthLibertyHosts =
  AuthLibertyHostMap | ((server: AuthLibertyServer) => string | undefined);

/** Where to look for a release. */
export interface ResolveAuthLibertyOptions {
  /** GitLab project path `group/name`. Default: `harmoniya/authliberty`. */
  readonly project?: string;
  /** GitLab instance URL. Default: `https://gitlab.com`. */
  readonly gitlab?: string;
  /** Optional GitLab token for private projects / higher rate limits. */
  readonly token?: string;
}

/** What to resolve. */
export interface AuthLibertyOptions extends ResolveAuthLibertyOptions {
  /**
   * AuthLiberty version. Accepts:
   *   - Exact version: `'0.3'`
   *   - `'latest'` — auto-updating `main` build (sha256 frozen at build time)
   */
  readonly version: string;
  /** Replacement host overrides. Each maps to a `-Dminecraft.api.*.host` system property. */
  readonly hosts?: AuthLibertyHosts;
}

/** One resolved agent jar. */
export interface AuthLibertyRelease {
  /** Package version, e.g. `0.3` or `latest`. */
  readonly version: string;
  /** Asset filename, e.g. `authliberty-0.3.jar`. */
  readonly filename: string;
  /** Direct download URL for the agent jar. */
  readonly url: string;
  /** Asset size in bytes. */
  readonly size: number;
  /** sha256 of the asset (hex), when GitLab reports one. */
  readonly sha256?: string;
  /** ISO timestamp the package was created. */
  readonly createdAt: string;
}

/** What AuthLiberty contributes. */
export interface AuthLibertyTemplate {
  /** The agent jar artifact. */
  readonly artifacts: Artifact[];
  /**
   * `-javaagent:<path>` plus a `-D` for each configured host. Spread these
   * into your launch args *before* the loader's own, so the redirector is in
   * place before any auth code runs.
   */
  readonly jvmArgs: Valset;
  /** Resolved release metadata, useful for logging / pinning. */
  readonly release: AuthLibertyRelease;
}

const SERVERS = ['auth', 'account', 'session', 'services'] as const;

/** A `hosts` function, called out into the map it stands for. */
function hostMap(hosts: AuthLibertyHosts | undefined): AuthLibertyHostMap {
  if (typeof hosts !== 'function') return hosts ?? {};
  return Object.fromEntries(
    SERVERS.map((server) => [server, hosts(server)] as const).filter(
      ([, url]) => url,
    ),
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Network
// ──────────────────────────────────────────────────────────────────────────

/** Resolve AuthLiberty into its agent jar and the JVM arguments that load it. */
export async function resolveAuthliberty(
  options: AuthLibertyOptions,
): Promise<AuthLibertyTemplate> {
  return (await napi.resolveAuthliberty({
    ...options,
    hosts: hostMap(options.hosts),
  })) as AuthLibertyTemplate;
}

/** Resolve a version, or `'latest'`, against the GitLab package registry. */
export async function resolveAuthLibertyVersion(
  input: string,
  options: ResolveAuthLibertyOptions = {},
): Promise<AuthLibertyRelease> {
  return (await napi.resolveAuthLibertyVersion(
    input,
    options,
  )) as AuthLibertyRelease;
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin
// ──────────────────────────────────────────────────────────────────────────

/** AuthLiberty — an authlib-injector `-javaagent` auth redirector. */
export function authliberty(
  version: string,
  opts: Omit<AuthLibertyOptions, 'version'> = {},
): ChainablePlugin<'authliberty', 'jvmArgs'> {
  return definePlugin({
    name: 'authliberty',
    async build(ctx) {
      const t = await resolveAuthliberty({ ...opts, version });
      ctx.log('authliberty', `resolved ${version}`);
      return { artifacts: t.artifacts, launch: { jvmArgs: t.jvmArgs } };
    },
  });
}
