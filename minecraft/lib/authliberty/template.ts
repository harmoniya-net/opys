import { type Artifact, sourceUrl } from '@lanka/core';
import type { Val, Valset } from '@lanka/core';
import {
  resolveAuthLibertyVersion,
  type AuthLibertyRelease,
  type ResolveAuthLibertyOptions,
} from './resolver';

/** Mojang server kind AuthLiberty's bytecode transformer can retarget. */
export type AuthLibertyServer = 'auth' | 'account' | 'session' | 'services';

/**
 * Per-server host overrides. Either:
 *   - an object — only the keys you set become `-D` flags; unset ones fall
 *     back to the original Mojang host at runtime, OR
 *   - a function — called once per server kind. Return a URL to override,
 *     or `undefined` / empty string to leave that server on its Mojang
 *     default.
 */
export type AuthLibertyHosts =
  | AuthLibertyHostMap
  | ((server: AuthLibertyServer) => string | undefined);

export interface AuthLibertyHostMap {
  /** `-Dminecraft.api.auth.host` — Yggdrasil auth server (default `https://authserver.mojang.com`). */
  auth?: string;
  /** `-Dminecraft.api.account.host` — account services (default `https://account.mojang.com`). */
  account?: string;
  /** `-Dminecraft.api.session.host` — session/profile server (default `https://sessionserver.mojang.com`). */
  session?: string;
  /** `-Dminecraft.api.services.host` — Minecraft Services API (default `https://api.minecraftservices.com`). */
  services?: string;
}

export interface AuthLibertyOptions {
  /**
   * AuthLiberty version. Accepts:
   *   - Exact version: `'0.3'`
   *   - `'latest'` — auto-updating `main` build (sha256 frozen at template-build time)
   */
  version: string;
  /** GitLab project path. Default: `harmoniya/authliberty`. */
  project?: string;
  /** GitLab instance URL. Default: `https://gitlab.com`. */
  gitlab?: string;
  /** Optional GitLab token for private projects / higher rate limits. */
  token?: string;
  /** Replacement host overrides. Each maps to a `-Dminecraft.api.*.host` system property. */
  hosts?: AuthLibertyHosts;
}

export interface AuthLibertyTemplate {
  /** The agent jar artifact. */
  artifacts: Artifact[];
  /**
   * JVM args to add to the launch command — `-javaagent:<path>` plus a
   * `-D` for each configured host. Spread these into your loader
   * template's `command.args` (typically *before* the loader's own
   * `-javaagent:` and main-class args, so the redirector is in place
   * before any auth code runs).
   */
  jvmArgs: Valset;
  /** Resolved release metadata, useful for logging / pinning. */
  release: AuthLibertyRelease;
}

const HOST_PROPS = {
  auth: 'minecraft.api.auth.host',
  account: 'minecraft.api.account.host',
  session: 'minecraft.api.session.host',
  services: 'minecraft.api.services.host',
} as const satisfies Record<AuthLibertyServer, string>;

const SERVERS = Object.keys(HOST_PROPS) as AuthLibertyServer[];

function resolveHost(
  hosts: AuthLibertyHosts | undefined,
  server: AuthLibertyServer,
): string | undefined {
  if (!hosts) return undefined;
  const raw = typeof hosts === 'function' ? hosts(server) : hosts[server];
  return raw ? raw : undefined;
}

function val(value: string): Val {
  return { rules: [], value: [value] };
}

/**
 * Build a lanka template fragment that loads AuthLiberty as a `-javaagent`
 * and points Mojang's auth/account/session/services hosts at the configured
 * replacements.
 *
 * The agent jar lands at `${library_directory}/net/harmoniya/authliberty/<v>/authliberty-<v>.jar`
 * (a maven-ish path mirroring how Forge/Cleanroom organize bootstrap jars).
 * The `jvmArgs` Valset is meant to be spread into a loader template's
 * `command.args` — AuthLiberty has no main class, no classpath needs, and
 * doesn't interact with any loader's bootstrap, so it composes cleanly with
 * any of `@lanka/{minecraft,forge,cleanroom,lwjgl3ify}`.
 */
export async function resolveAuthliberty(
  options: AuthLibertyOptions,
): Promise<AuthLibertyTemplate> {
  const release = await resolveAuthLibertyVersion(options.version, {
    project: options.project,
    gitlab: options.gitlab,
    token: options.token,
  } satisfies ResolveAuthLibertyOptions);

  const path = `\${library_directory}/net/harmoniya/authliberty/${release.version}/${release.filename}`;

  const artifact: Artifact = {
    path,
    source: sourceUrl(release.url),
    size: release.size,
    rules: [],
    ...(release.sha256 ? { integrity: { sha256: release.sha256 } } : {}),
  };

  const args: Val[] = [val(`-javaagent:${path}`)];
  for (const server of SERVERS) {
    const url = resolveHost(options.hosts, server);
    if (url) args.push(val(`-D${HOST_PROPS[server]}=${url}`));
  }

  return {
    artifacts: [artifact],
    jvmArgs: args,
    release,
  };
}
