import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createPublicKey, verify } from 'node:crypto';
import { resolveBifrost } from '../../lib/bifrost';

/** Generate a fresh Ed25519 keypair as PEM strings. */
function ed25519Keys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicKey,
  };
}

function decodeSegment(seg: string): unknown {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

describe('resolveBifrost', () => {
  it('mints a three-segment JWT with EdDSA header', () => {
    const { privatePem } = ed25519Keys();
    const auth = resolveBifrost({
      privateKey: privatePem,
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000000',
    });
    const parts = auth.token.split('.');
    expect(parts).toHaveLength(3);
    expect(decodeSegment(parts[0]!)).toEqual({ alg: 'EdDSA', typ: 'JWT' });
  });

  it('mirrors username and strips dashes from uuid', () => {
    const { privatePem } = ed25519Keys();
    const auth = resolveBifrost({
      privateKey: privatePem,
      username: 'Steve',
      uuid: 'AAAA-BBBB-cccc',
    });
    expect(auth.username).toBe('Steve');
    expect(auth.uuid).toBe('aaaabbbbcccc');
  });

  it('embeds uuid, username, iat and exp claims in the payload', () => {
    const { privatePem } = ed25519Keys();
    const now = new Date('2024-01-01T00:00:00Z');
    const auth = resolveBifrost({
      privateKey: privatePem,
      username: 'Player',
      uuid: '11111111-1111-1111-1111-111111111111',
      now,
      expiresIn: 3600,
    });
    const payload = decodeSegment(auth.token.split('.')[1]!) as Record<
      string,
      unknown
    >;
    const iat = Math.floor(now.getTime() / 1000);
    expect(payload).toEqual({
      uuid: '11111111111111111111111111111111',
      username: 'Player',
      iat,
      exp: iat + 3600,
    });
  });

  it('defaults the token lifetime to 24h', () => {
    const { privatePem } = ed25519Keys();
    const auth = resolveBifrost({
      privateKey: privatePem,
      username: 'P',
      uuid: 'x',
      now: 0,
    });
    const payload = decodeSegment(auth.token.split('.')[1]!) as {
      exp: number;
    };
    expect(payload.exp).toBe(86400);
  });

  it('omits exp entirely when expiresIn is 0', () => {
    const { privatePem } = ed25519Keys();
    const auth = resolveBifrost({
      privateKey: privatePem,
      username: 'P',
      uuid: 'x',
      expiresIn: 0,
    });
    const payload = decodeSegment(auth.token.split('.')[1]!) as Record<
      string,
      unknown
    >;
    expect(payload.exp).toBeUndefined();
  });

  it('accepts a numeric epoch-ms timestamp for now', () => {
    const { privatePem } = ed25519Keys();
    const auth = resolveBifrost({
      privateKey: privatePem,
      username: 'P',
      uuid: 'x',
      now: 5000,
      expiresIn: 0,
    });
    const payload = decodeSegment(auth.token.split('.')[1]!) as {
      iat: number;
    };
    expect(payload.iat).toBe(5);
  });

  it('produces a signature verifiable with the matching public key', () => {
    const { privatePem, publicKey } = ed25519Keys();
    const auth = resolveBifrost({
      privateKey: privatePem,
      username: 'Player',
      uuid: 'abc',
    });
    const [h, p, s] = auth.token.split('.');
    const sig = Buffer.from(s!.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    expect(verify(null, Buffer.from(`${h}.${p}`), publicKey, sig)).toBe(true);
  });

  it('accepts a single-line key with literal \\n separators', () => {
    const { privatePem } = ed25519Keys();
    const oneLine = privatePem.replace(/\n/g, '\\n');
    expect(() =>
      resolveBifrost({ privateKey: oneLine, username: 'P', uuid: 'x' }),
    ).not.toThrow();
  });

  it('adds a missing PEM header when only the body is supplied', () => {
    const { privatePem } = ed25519Keys();
    const body = privatePem
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .trim();
    expect(() =>
      resolveBifrost({ privateKey: body, username: 'P', uuid: 'x' }),
    ).not.toThrow();
  });

  it('throws when the private key is empty', () => {
    expect(() =>
      resolveBifrost({ privateKey: '', username: 'P', uuid: 'x' }),
    ).toThrow(/privateKey is required/);
  });

  it('throws when the key is not Ed25519', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rsaPem = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string;
    expect(() =>
      resolveBifrost({ privateKey: rsaPem, username: 'P', uuid: 'x' }),
    ).toThrow(/must be Ed25519/);
  });

  it('derives a public key from the minted private key (sanity)', () => {
    const { privatePem } = ed25519Keys();
    expect(() => createPublicKey(privatePem)).not.toThrow();
  });
});
