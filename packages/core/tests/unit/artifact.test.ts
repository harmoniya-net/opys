import { describe, expect, test } from 'vitest';
import {
  deduplicateArtifacts,
  sourceFile,
  sourceUrl,
  type Artifact,
} from '../../lib';

const make = (path: string, marker: string): Artifact => ({
  path,
  source: sourceUrl(`https://example.test/${marker}`),
  rules: [],
});

describe('deduplicateArtifacts', () => {
  test('later entries win on identical path', () => {
    const out = deduplicateArtifacts([
      make('a.jar', 'first'),
      make('a.jar', 'second'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toEqual(sourceUrl('https://example.test/second'));
  });

  test('normalizes `./` and `.` segments', () => {
    const out = deduplicateArtifacts([
      make('./mods/x.jar', 'first'),
      make('mods/./x.jar', 'second'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toEqual(sourceUrl('https://example.test/second'));
  });

  test('resolves `..` against the preceding segment', () => {
    const out = deduplicateArtifacts([
      make('mods/sub/../x.jar', 'first'),
      make('mods/x.jar', 'second'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toEqual(sourceUrl('https://example.test/second'));
  });

  test('`..` past the root of a relative path stays as `..`', () => {
    const out = deduplicateArtifacts([
      make('../escape.jar', 'first'),
      make('../escape.jar', 'second'),
    ]);
    expect(out).toHaveLength(1);
  });

  test('`..` past the leading `/` of an absolute path is dropped', () => {
    const out = deduplicateArtifacts([
      make('/../escape.jar', 'first'),
      make('/escape.jar', 'second'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toEqual(sourceUrl('https://example.test/second'));
  });

  test('preserves order of distinct paths', () => {
    const out = deduplicateArtifacts([
      make('a.jar', 'a'),
      make('b.jar', 'b'),
      make('c.jar', 'c'),
    ]);
    expect(out.map((u) => u.path)).toEqual(['a.jar', 'b.jar', 'c.jar']);
  });

  test('empty input returns empty array', () => {
    expect(deduplicateArtifacts([])).toEqual([]);
  });

  test('source kind is preserved through dedup', () => {
    const out = deduplicateArtifacts([
      { path: 'a', source: sourceFile('/tmp/a'), rules: [] },
    ]);
    expect(out[0]!.source).toEqual({ kind: 'file', file: '/tmp/a' });
  });
});
