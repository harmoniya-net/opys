import { describe, expect, it } from 'vitest';
import {
  PointerDescriptorWireSchema,
  decodePointerDescriptor,
  encodePointerDescriptor,
  parsePointerDescriptor,
  type PointerDescriptor,
} from '../../lib/pointer';
import {
  SourceWireSchema,
  decodeSource,
  encodeSource,
  isSourcePointer,
  sourcePointer,
  sourceUrl,
} from '../../lib/source';

const roundTripDescriptor = (d: PointerDescriptor): PointerDescriptor =>
  decodePointerDescriptor(
    PointerDescriptorWireSchema.parse(encodePointerDescriptor(d)),
  );

describe('pointer source', () => {
  it('discriminates correctly', () => {
    const s = sourcePointer('https://example.com/latest.json');
    expect(isSourcePointer(s)).toBe(true);
    expect(s).toEqual({
      kind: 'pointer',
      pointer: 'https://example.com/latest.json',
    });
  });

  it('round-trips through the source codec', () => {
    const s = sourcePointer('https://example.com/latest.json');
    expect(decodeSource(SourceWireSchema.parse(encodeSource(s)))).toEqual(s);
  });
});

describe('PointerDescriptor', () => {
  it('round-trips with integrity and size', () => {
    const d: PointerDescriptor = {
      source: sourceUrl('https://cdn/lang-2.4.1.zip'),
      integrity: { sha256: 'abc123' },
      size: 4096,
    };
    expect(roundTripDescriptor(d)).toEqual(d);
  });

  it('round-trips without optional fields', () => {
    const d: PointerDescriptor = { source: sourceUrl('https://cdn/lang.zip') };
    expect(roundTripDescriptor(d)).toEqual({ source: d.source });
  });

  it('parses a published JSON descriptor', () => {
    const json = JSON.stringify({
      source: { url: 'https://cdn/lang-2.4.1.zip' },
      integrity: { sha1: 'deadbeef' },
      size: 1234,
    });
    expect(parsePointerDescriptor(json)).toEqual({
      source: sourceUrl('https://cdn/lang-2.4.1.zip'),
      integrity: { sha1: 'deadbeef' },
      size: 1234,
    });
  });

  it('allows a descriptor that points at another pointer', () => {
    const json = JSON.stringify({
      source: { pointer: 'https://example.com/stable.json' },
    });
    expect(parsePointerDescriptor(json).source).toEqual(
      sourcePointer('https://example.com/stable.json'),
    );
  });

  it('rejects non-JSON input with a clear message', () => {
    expect(() => parsePointerDescriptor('not json')).toThrow(/not valid JSON/);
  });

  it('rejects a descriptor missing a source', () => {
    expect(() => parsePointerDescriptor('{"size":10}')).toThrow();
  });
});
