import { describe, expect, it } from 'vitest';
import {
  decodeArtifact,
  encodeArtifact,
  artifactApplies,
  ArtifactWireSchema,
  type ArtifactWire,
} from '../../lib/artifact';
import { LINUX, OSX } from './fixtures';

describe('decodeArtifact', () => {
  it('decodes a minimal url artifact', () => {
    const a = decodeArtifact({ path: 'a.jar', source: { url: 'https://x' } });
    expect(a.path).toBe('a.jar');
    expect(a.source).toEqual({ kind: 'url', url: 'https://x' });
    expect(a.rules).toEqual([]);
    expect(a.size).toBeUndefined();
    expect(a.integrity).toBeUndefined();
    expect(a.discovery).toBeUndefined();
    expect(a.metadata).toBeUndefined();
    expect(a.extract).toBeUndefined();
  });

  it('decodes every optional field when present', () => {
    const wire: ArtifactWire = {
      path: 'mods/a.jar',
      source: { url: 'https://x' },
      size: 1234,
      rules: 'allow.os.linux',
      integrity: { sha1: 'abc' },
      discovery: { size: { header: 'Content-Length' } },
      metadata: { tag: 'demo' },
      extract: { file: 'inner.txt', into: 'out/' },
    };
    const a = decodeArtifact(wire);
    expect(a.size).toBe(1234);
    expect(a.rules).toHaveLength(1);
    expect(a.integrity).toEqual({ sha1: 'abc' });
    expect(a.discovery).toEqual({ size: { header: 'Content-Length' } });
    expect(a.metadata).toEqual({ tag: 'demo' });
    expect(a.extract).toEqual([
      { kind: 'pick', file: 'inner.txt', into: 'out/' },
    ]);
  });

  it('treats null rules as no rules', () => {
    const a = decodeArtifact({
      path: 'a',
      source: { string: 'x' },
      rules: null,
    });
    expect(a.rules).toEqual([]);
  });
});

describe('encodeArtifact', () => {
  it('omits absent optional fields', () => {
    const wire = encodeArtifact(
      decodeArtifact({ path: 'a', source: { url: 'https://x' } }),
    );
    expect(wire).toEqual({ path: 'a', source: { url: 'https://x' } });
  });

  it('round-trips a fully-populated artifact (decode is idempotent)', () => {
    const wire: ArtifactWire = {
      path: 'mods/a.jar',
      source: { url: 'https://x' },
      size: 9,
      rules: 'allow.os.osx',
      integrity: { sha256: 'h' },
      discovery: { integrity: { header: { sha1: 'X-Digest' } } },
      metadata: 'note',
      extract: [{ matches: '*.jar', into: 'mods/' }],
    };
    const once = decodeArtifact(wire);
    expect(decodeArtifact(encodeArtifact(once))).toEqual(once);
  });

  it('round-trips a bytes source', () => {
    const wire: ArtifactWire = {
      path: 'a.bin',
      source: { bytes: Buffer.from('hello').toString('base64') },
    };
    const a = decodeArtifact(wire);
    expect(a.source.kind).toBe('bytes');
    expect(encodeArtifact(a)).toEqual(wire);
  });

  it('preserves metadata that is explicitly null', () => {
    const a = decodeArtifact({
      path: 'a',
      source: { string: 'x' },
      metadata: null,
    });
    expect(a.metadata).toBeNull();
    expect(encodeArtifact(a).metadata).toBeNull();
  });
});

describe('artifactApplies', () => {
  it('an artifact with no rules applies everywhere', () => {
    const a = decodeArtifact({ path: 'a', source: { string: 'x' } });
    expect(artifactApplies(a, LINUX)).toBe(true);
    expect(artifactApplies(a, OSX)).toBe(true);
  });

  it('respects an OS rule', () => {
    const a = decodeArtifact({
      path: 'a',
      source: { string: 'x' },
      rules: 'allow.os.linux',
    });
    expect(artifactApplies(a, LINUX)).toBe(true);
    expect(artifactApplies(a, OSX)).toBe(false);
  });

  it('respects feature flags', () => {
    const a = decodeArtifact({
      path: 'a',
      source: { string: 'x' },
      rules: 'allow.features.demo',
    });
    expect(artifactApplies(a, LINUX, ['demo'])).toBe(true);
    expect(artifactApplies(a, LINUX)).toBe(false);
  });
});

describe('ArtifactWireSchema', () => {
  it('rejects a negative size', () => {
    expect(() =>
      ArtifactWireSchema.parse({
        path: 'a',
        source: { url: 'https://x' },
        size: -1,
      }),
    ).toThrow();
  });

  it('rejects a missing source', () => {
    expect(() => ArtifactWireSchema.parse({ path: 'a' })).toThrow();
  });
});
