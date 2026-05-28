import { describe, expect, test } from 'vitest';
import {
  isSourceBytes,
  isSourceFile,
  isSourcePointer,
  isSourceString,
  isSourceUrl,
  sourceBytes,
  sourceFile,
  sourcePointer,
  sourceString,
  sourceUrl,
} from '../../lib';

describe('Source factories', () => {
  test('sourceUrl', () => {
    const s = sourceUrl('https://a/x');
    expect(s).toEqual({ kind: 'url', url: 'https://a/x' });
    expect(isSourceUrl(s)).toBe(true);
    expect(isSourceFile(s)).toBe(false);
  });

  test('sourceFile', () => {
    const s = sourceFile('/tmp/x');
    expect(s).toEqual({ kind: 'file', file: '/tmp/x' });
    expect(isSourceFile(s)).toBe(true);
  });

  test('sourceString', () => {
    const s = sourceString('hi');
    expect(s).toEqual({ kind: 'string', string: 'hi' });
    expect(isSourceString(s)).toBe(true);
  });

  test('sourcePointer', () => {
    const s = sourcePointer('forge:libraries.json');
    expect(s).toEqual({ kind: 'pointer', pointer: 'forge:libraries.json' });
    expect(isSourcePointer(s)).toBe(true);
  });
});

describe('sourceBytes', () => {
  test('base64-encodes the raw bytes', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const s = sourceBytes(bytes);
    expect(s).toEqual({ kind: 'bytes', bytes: 'SGVsbG8=' });
    expect(isSourceBytes(s)).toBe(true);
  });

  test('handles the empty buffer', () => {
    expect(sourceBytes(new Uint8Array())).toEqual({ kind: 'bytes', bytes: '' });
  });

  test('round-trips through Buffer.from(…, "base64")', () => {
    const original = new Uint8Array([0, 1, 2, 250, 255]);
    const s = sourceBytes(original);
    if (!isSourceBytes(s)) throw new Error('expected bytes-kind source');
    const decoded = Uint8Array.from(Buffer.from(s.bytes, 'base64'));
    expect(decoded).toEqual(original);
  });
});
