/**
 * Mint a [Bifrost](https://gitlab.com/harmoniya/bifrost)-compatible JWT
 * locally so opys's `runClient` can launch Minecraft against a self-hosted
 * Yggdrasil server without going through the OAuth `/token` flow.
 *
 * Bifrost validates incoming bearer tokens with a single Ed25519 public key
 * and only requires two claims: `uuid` and `username`. We sign here with
 * the matching Ed25519 private key — same alg (`EdDSA`), same payload shape
 * as Bifrost's own `/token` endpoint (`{ uuid, username, iat, exp }`).
 *
 * The signing is the `opys-bifrost` crate's and is tested there. What is
 * left here is the typed surface, and the one thing only JS has: a `Date`.
 * The codegen'd `.d.ts` types the return value as `Json` (≈ unknown), so the
 * wrapper carries one `as`-cast at the boundary. No `as unknown as`.
 */

import * as napi from '@opys/bifrost-binding';

export interface BifrostOptions {
  /**
   * PEM-encoded Ed25519 private key (PKCS8). Single-line keys with literal
   * `\n` separators are accepted (env-var-friendly); a missing
   * `-----BEGIN PRIVATE KEY-----` header is added automatically.
   */
  privateKey: string;
  /** Player username — used as the `username` claim and mirrored to the result. */
  username: string;
  /** Player UUID. Dashes are stripped before signing (matches Bifrost). */
  uuid: string;
  /**
   * Token lifetime in seconds. Default `86400` (24h, matches Bifrost's
   * `/token`). Pass `0` to omit `exp` entirely.
   */
  expiresIn?: number;
  /** Override the issued-at timestamp (ms since epoch or `Date`). Defaults to `Date.now()`. */
  now?: number | Date;
}

export interface BifrostAuth {
  /** Player username, mirrored from input. */
  username: string;
  /** Dashless UUID (32 hex chars). */
  uuid: string;
  /** Signed Ed25519 JWT. Pass as `${token}` in your launch vars. */
  token: string;
}

/** How long a token lives when `expiresIn` is not given, in seconds. */
export const DEFAULT_TTL_SECONDS: number = napi.defaultBifrostTtl();

/**
 * Sign an Ed25519 JWT with `{ uuid, username, iat, exp }` claims and return
 * an auth object ready to spread into `runClient.vars`.
 *
 * ```ts
 * const auth = resolveBifrost({
 *   privateKey: process.env.BIFROST_PRIVATE_KEY,
 *   username: 'Player',
 *   uuid: '00000000-0000-0000-0000-000000000000',
 * });
 * // auth = { username, uuid, token }
 * ```
 *
 * The token mirrors what Bifrost's own `/token` endpoint mints, so it
 * passes `authMiddleware` validation against the matching public key.
 */
export function resolveBifrost(options: BifrostOptions): BifrostAuth {
  const { now, privateKey, ...rest } = options;
  return napi.mintBifrost({
    ...rest,
    // An unset environment variable arrives as `undefined` whatever the type
    // says. Passed on as empty, it gets the crate's message about where a key
    // comes from rather than one about a missing field.
    privateKey: privateKey ?? '',
    ...(now === undefined
      ? {}
      : { now: Math.floor(now instanceof Date ? now.getTime() : now) }),
  }) as BifrostAuth;
}
