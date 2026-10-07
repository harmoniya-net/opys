import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  blobBytes,
  blobFile,
  blobId,
  decodeManifest,
  encodeManifest,
  sourceBlob,
  sourceUrl,
} from '../../lib';

const HELLO =
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

// `Source` is the wire shape — discriminated by which field is present, with
// no tag. Narrowing is `'blob' in s`, which is why there are no `isSourceX`
// guards to test.
describe('Source factories', () => {
  test('sourceUrl', () => {
    expect(sourceUrl('https://a/x')).toEqual({ url: 'https://a/x' });
  });

  test('sourceBlob', () => {
    expect(sourceBlob(HELLO)).toEqual({ blob: HELLO });
  });
});

describe('blobs', () => {
  test('a blob is named by the sha256 of its bytes', () => {
    const bytes = new TextEncoder().encode('hello');
    expect(blobId(bytes)).toBe(HELLO);
    expect(blobId(bytes)).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
  });

  test('blobBytes base64-encodes, so it survives the trip into Rust', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(blobBytes(bytes)).toEqual({ bytes: 'SGVsbG8=' });
    expect(blobBytes(new Uint8Array())).toEqual({ bytes: '' });
  });

  test('blobFile names where the bytes are', () => {
    expect(blobFile('/srv/a.jar')).toEqual({ file: '/srv/a.jar' });
  });

  test('a blob artifact has one spelling, with no integrity beside it', () => {
    const wire = { path: 'a.txt', source: { blob: HELLO }, size: 5 };
    // An integrity that agrees with the name is accepted and not kept: the
    // name already is one.
    const redundant = { ...wire, integrity: { sha256: HELLO } };
    expect(decodeManifest({ artifacts: [redundant] }).artifacts).toEqual([
      wire,
    ]);
    const encoded = encodeManifest({ vars: {}, artifacts: [redundant] });
    expect((encoded as { artifacts: unknown[] }).artifacts).toEqual([wire]);
  });

  test('a blob artifact whose integrity names other bytes is refused', () => {
    const artifact = {
      path: 'a.txt',
      source: { blob: HELLO },
      integrity: { sha256: '0'.repeat(64) },
    };
    expect(() => decodeManifest({ artifacts: [artifact] })).toThrow(
      /a blob is verified by its own name/,
    );
  });
});

describe('what the format no longer has', () => {
  test.each([
    ['file', '/srv/a.jar'],
    ['string', 'hello'],
    ['bytes', 'aGVsbG8='],
  ])('a `%s` source is refused by name', (field, value) => {
    expect(() =>
      decodeManifest({
        artifacts: [{ path: 'a', source: { [field]: value } }],
      }),
    ).toThrow(`unknown field \`${field}\``);
  });

  test('a blob id that is not a sha256 is refused', () => {
    expect(() =>
      decodeManifest({ artifacts: [{ path: 'a', source: { blob: 'abc' } }] }),
    ).toThrow(/is not a blob id/);
  });
});
