import { describe, expect, it } from 'vitest';
import {
  DiscoverySchema,
  encodeDiscovery,
  type Discovery,
} from '../../lib/discovery';

describe('Discovery round-trips', () => {
  it('integrity header + url probes', () => {
    const d: Discovery = {
      integrity: {
        header: { sha256: 'Repr-Digest' },
        url: { sha256: '${url}.sha256' },
      },
    };
    expect(DiscoverySchema.parse(encodeDiscovery(d))).toEqual(d);
  });

  it('size probe', () => {
    const d: Discovery = { size: { header: 'Content-Length' } };
    expect(DiscoverySchema.parse(encodeDiscovery(d))).toEqual(d);
  });

  it('integrity and size together', () => {
    const d: Discovery = {
      integrity: { url: { sha1: 'https://h/SHA1SUMS' } },
      size: { header: 'Content-Length' },
    };
    expect(DiscoverySchema.parse(encodeDiscovery(d))).toEqual(d);
  });

  it('parses a discovery block from JSON', () => {
    const parsed = DiscoverySchema.parse({
      integrity: { url: { md5: 'https://h/file.md5' } },
    });
    expect(parsed).toEqual({
      integrity: { url: { md5: 'https://h/file.md5' } },
    });
  });

  it('rejects a hash ref with no algorithm', () => {
    expect(() =>
      DiscoverySchema.parse({ integrity: { header: { sha512: 'X' } } }),
    ).toThrow();
  });
});
