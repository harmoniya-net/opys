import { describe, expect, it } from 'vitest';
import {
  sourceUrl,
  sourceFile,
  sourceString,
  sourceBytes,
  sourcePointer,
  SourceWireSchema,
  decodeSource,
  encodeSource,
  isSourceUrl,
  isSourceFile,
  isSourceString,
  isSourceBytes,
  isSourcePointer,
  type Source,
} from '../../lib/source';

const roundTrip = (s: Source): Source =>
  decodeSource(SourceWireSchema.parse(encodeSource(s)));

describe('Source type guards', () => {
  it('sourceString discriminates correctly', () => {
    const s = sourceString('hello');
    expect(isSourceString(s)).toBe(true);
    expect(isSourceUrl(s)).toBe(false);
    expect(isSourceFile(s)).toBe(false);
  });

  it('sourceUrl discriminates correctly', () => {
    const s = sourceUrl('https://x.com');
    expect(isSourceUrl(s)).toBe(true);
    expect(isSourceFile(s)).toBe(false);
    expect(isSourceString(s)).toBe(false);
  });
});

describe('Source round-trips', () => {
  it('url', () => {
    const s = sourceUrl('https://example.com/file.jar');
    expect(roundTrip(s)).toEqual(s);
  });

  it('file', () => {
    const s = sourceFile('/tmp/file.txt');
    expect(roundTrip(s)).toEqual(s);
  });

  it('string', () => {
    const s = sourceString('hello');
    expect(roundTrip(s)).toEqual(s);
  });

  it('empty string content', () => {
    const s = sourceString('');
    expect(roundTrip(s)).toEqual(s);
  });

  it('bytes', () => {
    const s = sourceBytes(new Uint8Array([1, 2, 3, 255]));
    expect(s.kind).toBe('bytes');
    expect(roundTrip(s)).toEqual(s);
  });

  it('pointer', () => {
    const s = sourcePointer('https://h/latest.json');
    expect(roundTrip(s)).toEqual(s);
  });
});

describe('bytes and pointer type guards', () => {
  it('isSourceBytes discriminates correctly', () => {
    const s = sourceBytes(new Uint8Array([0]));
    expect(isSourceBytes(s)).toBe(true);
    expect(isSourcePointer(s)).toBe(false);
    expect(isSourceUrl(s)).toBe(false);
  });

  it('isSourcePointer discriminates correctly', () => {
    const s = sourcePointer('https://h/p.json');
    expect(isSourcePointer(s)).toBe(true);
    expect(isSourceBytes(s)).toBe(false);
  });
});
