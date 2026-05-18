import { describe, expect, it } from 'vitest';
import {
  DiscoveryWireSchema,
  decodeDiscovery,
  encodeDiscovery,
  type Discovery,
} from '../../lib/discovery';

const decode = (wire: unknown): Discovery =>
  decodeDiscovery(DiscoveryWireSchema.parse(wire));

describe('Discovery round-trips', () => {
  it('integrity header + url probes', () => {
    const d: Discovery = {
      integrity: {
        header: { sha256: 'Repr-Digest' },
        url: { sha256: '${url}.sha256' },
      },
    };
    expect(decode(encodeDiscovery(d))).toEqual(d);
  });

  it('size probe', () => {
    const d: Discovery = { size: { header: 'Content-Length' } };
    expect(decode(encodeDiscovery(d))).toEqual(d);
  });

  it('integrity and size together', () => {
    const d: Discovery = {
      integrity: { url: { sha1: 'https://h/SHA1SUMS' } },
      size: { header: 'Content-Length' },
    };
    expect(decode(encodeDiscovery(d))).toEqual(d);
  });

  it('parses a discovery block from JSON', () => {
    const parsed = decode({
      integrity: { url: { md5: 'https://h/file.md5' } },
    });
    expect(parsed).toEqual({
      integrity: { url: { md5: 'https://h/file.md5' } },
    });
  });

  it('rejects a hash ref with no algorithm', () => {
    expect(() =>
      DiscoveryWireSchema.parse({ integrity: { header: { sha512: 'X' } } }),
    ).toThrow();
  });

  it('encodes an empty integrity block', () => {
    expect(encodeDiscovery({ integrity: {} })).toEqual({ integrity: {} });
  });

  it('encodes a size block without a header', () => {
    expect(encodeDiscovery({ size: {} })).toEqual({ size: {} });
  });

  it('encodes an empty discovery as an empty object', () => {
    expect(encodeDiscovery({})).toEqual({});
  });
});
