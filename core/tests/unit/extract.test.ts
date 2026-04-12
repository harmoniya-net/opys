import { describe, expect, it } from 'vitest';
import {
  ExtractSchema,
  encodeExtract,
  extractPick,
  extractDump,
  extractScan,
} from '../../lib/extract';

describe('Extract codec', () => {
  it('single rule round-trips as object not array', () => {
    const rules = [extractPick('README.md', 'docs/manual.txt')];
    const encoded = encodeExtract(rules);
    expect(Array.isArray(encoded)).toBe(false);
    expect(encoded).toMatchObject({
      file: 'README.md',
      into: 'docs/manual.txt',
    });
    const decoded = ExtractSchema.parse(encoded);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.kind).toBe('pick');
  });

  it('multiple rules round-trip as array', () => {
    const rules = [
      extractPick('README.md', 'docs/manual.txt'),
      extractDump('dump/'),
    ];
    const encoded = encodeExtract(rules);
    expect(Array.isArray(encoded)).toBe(true);
    expect(ExtractSchema.parse(encoded)).toHaveLength(2);
  });

  it('Dump rule encodes clean field', () => {
    const dump = extractDump('natives/', {
      excludes: ['META-INF/'],
      clean: true,
    });
    const encoded = encodeExtract([dump]);
    expect(encoded).toMatchObject({
      into: 'natives/',
      excludes: ['META-INF/'],
      clean: true,
    });
  });

  it('Dump rule clean defaults to undefined', () => {
    const decoded = ExtractSchema.parse({ into: 'out/' });
    expect(decoded[0]!.kind).toBe('dump');
    if (decoded[0]!.kind === 'dump') expect(decoded[0]!.clean).toBeUndefined();
  });

  it('discriminates Pick / Scan / Dump by shape', () => {
    expect(ExtractSchema.parse({ file: 'a.txt', into: 'b.txt' })[0]!.kind).toBe(
      'pick',
    );
    expect(
      ExtractSchema.parse({ matches: '**/*.so', into: 'libs/' })[0]!.kind,
    ).toBe('scan');
    expect(ExtractSchema.parse({ into: 'dump/' })[0]!.kind).toBe('dump');
  });
});
