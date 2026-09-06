import { describe, expect, test } from 'vitest';
import {
  sourceBytes,
  sourceFile,
  sourcePointer,
  sourceString,
  sourceUrl,
} from '../../lib';

// `Source` is the frozen wire shape — discriminated by which field is present,
// with no tag. Narrowing is `'bytes' in s`, which is why there are no
// `isSourceX` guards to test.
describe('Source factories', () => {
  test('sourceUrl', () => {
    expect(sourceUrl('https://a/x')).toEqual({ url: 'https://a/x' });
  });

  test('sourceFile', () => {
    expect(sourceFile('/tmp/x')).toEqual({ file: '/tmp/x' });
  });

  test('sourceString', () => {
    expect(sourceString('hi')).toEqual({ string: 'hi' });
  });

  test('sourcePointer', () => {
    expect(sourcePointer('forge:libraries.json')).toEqual({
      pointer: 'forge:libraries.json',
    });
  });
});

describe('sourceBytes', () => {
  test('base64-encodes the raw bytes', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(sourceBytes(bytes)).toEqual({ bytes: 'SGVsbG8=' });
  });

  test('handles the empty buffer', () => {
    expect(sourceBytes(new Uint8Array())).toEqual({ bytes: '' });
  });

  test('round-trips through Buffer.from(…, "base64")', () => {
    const original = new Uint8Array([0, 1, 2, 250, 255]);
    const s = sourceBytes(original);
    if (!('bytes' in s)) throw new Error('expected a bytes source');
    const decoded = Uint8Array.from(Buffer.from(s.bytes, 'base64'));
    expect(decoded).toEqual(original);
  });
});
