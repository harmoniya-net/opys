import { describe, expect, it } from 'vitest';
import {
  exactSize,
  atLeastSize,
  unknownSize,
  zeroSize,
  addSize,
  sizeBytes,
} from '../../lib/size';

describe('addSize', () => {
  it('exact + exact = exact', () => {
    expect(addSize(exactSize(100), exactSize(200))).toEqual(exactSize(300));
  });

  it('exact + unknown = atLeast', () => {
    const result = addSize(exactSize(100), unknownSize());
    expect(result.kind).toBe('at-least');
    expect(result.kind !== 'unknown' ? result.bytes : undefined).toBe(100);
  });

  it('unknown + unknown = atLeast(0)', () => {
    const result = addSize(unknownSize(), unknownSize());
    expect(result.kind).toBe('at-least');
    expect(result.kind !== 'unknown' ? result.bytes : undefined).toBe(0);
  });

  it('atLeast + exact = atLeast', () => {
    const result = addSize(atLeastSize(50), exactSize(50));
    expect(result.kind).toBe('at-least');
    expect(result.kind !== 'unknown' ? result.bytes : undefined).toBe(100);
  });

  it('zero is identity for exact', () => {
    expect(addSize(zeroSize(), exactSize(42))).toEqual(exactSize(42));
  });
});

describe('sizeBytes', () => {
  it('returns bytes for exact and atLeast', () => {
    expect(sizeBytes(exactSize(7))).toBe(7);
    expect(sizeBytes(atLeastSize(3))).toBe(3);
  });

  it('returns undefined for unknown', () => {
    expect(sizeBytes(unknownSize())).toBeUndefined();
  });
});
