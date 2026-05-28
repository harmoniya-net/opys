/**
 * Mint a [Bifrost](https://gitlab.com/harmoniya/bifrost)-compatible JWT
 * locally so lanka's `runClient` can launch Minecraft against a self-hosted
 * Yggdrasil server without going through the OAuth `/token` flow.
 *
 * Bifrost validates incoming bearer tokens with a single Ed25519 public key
 * and only requires two claims: `uuid` and `username`. We sign here with
 * the matching Ed25519 private key — same alg (`EdDSA`), same payload shape
 * as Bifrost's own `/token` endpoint (`{ uuid, username, iat, exp }`).
 */

import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

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

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

function normalizePrivateKey(raw: string): KeyObject {
  if (!raw) {
    throw new Error(
      'bifrost: privateKey is required (got empty/undefined). ' +
        'Set BIFROST_PRIVATE_KEY in your environment, e.g. ' +
        '`export BIFROST_PRIVATE_KEY="$(cat path/to/key.pem)"`.',
    );
  }
  const unescaped = raw.replace(/\\n/g, '\n').trim();
  const pem = unescaped.includes('-----BEGIN ')
    ? unescaped
    : `-----BEGIN PRIVATE KEY-----\n${unescaped}\n-----END PRIVATE KEY-----`;
  const key = createPrivateKey({ key: pem, format: 'pem' });
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(
      `Bifrost private key must be Ed25519; got ${key.asymmetricKeyType ?? 'unknown'}`,
    );
  }
  return key;
}

function base64url(input: string | Uint8Array): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function unixSeconds(t: number | Date | undefined): number {
  if (t === undefined) return Math.floor(Date.now() / 1000);
  const ms = t instanceof Date ? t.getTime() : t;
  return Math.floor(ms / 1000);
}

function sanitizeUuid(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase();
}

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
  const key = normalizePrivateKey(options.privateKey);
  const uuid = sanitizeUuid(options.uuid);
  const username = options.username;

  const iat = unixSeconds(options.now);
  const ttl = options.expiresIn ?? DEFAULT_TTL_SECONDS;
  const exp = ttl > 0 ? iat + ttl : null;

  const header = { alg: 'EdDSA', typ: 'JWT' };
  const payload: Record<string, unknown> = { uuid, username, iat };
  if (exp !== null) payload.exp = exp;

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = sign(null, Buffer.from(signingInput), key);
  const token = `${signingInput}.${base64url(signature)}`;

  return { username, uuid, token };
}
