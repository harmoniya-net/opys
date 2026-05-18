import { describe, expect, it } from 'vitest';
import {
  encodeIntegrity,
  integrityHashes,
  IntegrityWireSchema,
  type HashEntry,
} from '../../lib/integrity';

const sha1: HashEntry = { sha1: 'a'.repeat(40) };
const sha256: HashEntry = { sha256: 'b'.repeat(64) };

describe('encodeIntegrity', () => {
  it('passes a single entry through unchanged', () => {
    expect(encodeIntegrity(sha1)).toBe(sha1);
  });

  it('collapses a one-element array to the bare entry', () => {
    expect(encodeIntegrity([sha256])).toBe(sha256);
  });

  it('keeps a multi-element array as an array', () => {
    expect(encodeIntegrity([sha1, sha256])).toEqual([sha1, sha256]);
  });
});

describe('integrityHashes', () => {
  it('returns an empty array for undefined', () => {
    expect(integrityHashes(undefined)).toEqual([]);
  });

  it('wraps a single entry in an array', () => {
    expect(integrityHashes(sha1)).toEqual([sha1]);
  });

  it('returns an array as-is', () => {
    expect(integrityHashes([sha1, sha256])).toEqual([sha1, sha256]);
  });
});

describe('IntegrityWireSchema', () => {
  it('accepts each supported hash algorithm', () => {
    expect(IntegrityWireSchema.parse({ sha1: 'x' })).toEqual({ sha1: 'x' });
    expect(IntegrityWireSchema.parse({ sha256: 'x' })).toEqual({ sha256: 'x' });
    expect(IntegrityWireSchema.parse({ md5: 'x' })).toEqual({ md5: 'x' });
  });

  it('accepts an array of entries', () => {
    expect(IntegrityWireSchema.parse([{ sha1: 'x' }])).toEqual([{ sha1: 'x' }]);
  });

  it('rejects an unknown algorithm', () => {
    expect(() => IntegrityWireSchema.parse({ crc32: 'x' })).toThrow();
  });
});
