import { describe, expect, it } from 'vitest';
import {
  sourceUrl,
  sourceFile,
  sourceString,
  sourceEmpty,
  SourceSchema,
  encodeSource,
  isSourceUrl,
  isSourceFile,
  isSourceString,
  isSourceEmpty,
} from '../../lib/source';

describe('Source type guards', () => {
  it('sourceString is not empty', () => {
    const s = sourceString('');
    expect(isSourceEmpty(s)).toBe(false);
    expect(isSourceString(s)).toBe(true);
    expect(s.kind === 'string' ? s.string : undefined).toBe('');
  });

  it('sourceEmpty is empty and not string', () => {
    const s = sourceEmpty();
    expect(isSourceEmpty(s)).toBe(true);
    expect(isSourceString(s)).toBe(false);
  });

  it('sourceUrl is not a file or string', () => {
    const s = sourceUrl('https://x.com');
    expect(isSourceFile(s)).toBe(false);
    expect(isSourceString(s)).toBe(false);
    expect(isSourceUrl(s)).toBe(true);
  });
});

describe('Source round-trips', () => {
  it('url', () => {
    const s = sourceUrl('https://example.com/file.jar');
    const decoded = SourceSchema.parse(encodeSource(s));
    expect(decoded).toEqual(s);
  });

  it('file', () => {
    const s = sourceFile('/tmp/file.txt');
    expect(SourceSchema.parse(encodeSource(s))).toEqual(s);
  });

  it('string', () => {
    const s = sourceString('hello');
    expect(SourceSchema.parse(encodeSource(s))).toEqual(s);
  });

  it('empty', () => {
    const s = sourceEmpty();
    expect(SourceSchema.parse(encodeSource(s))).toEqual(s);
  });

  it('empty string content', () => {
    const s = sourceString('');
    const decoded = SourceSchema.parse(encodeSource(s));
    expect(decoded).toEqual(s);
  });
});
