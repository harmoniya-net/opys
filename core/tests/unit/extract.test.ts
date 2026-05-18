import { describe, expect, it } from 'vitest';
import {
  ExtractWireSchema,
  decodeExtract,
  encodeExtract,
  extractPick,
  extractScan,
  extractDump,
} from '../../lib/extract';

const decode = (wire: unknown) => decodeExtract(ExtractWireSchema.parse(wire));

describe('Extract codec', () => {
  it('single rule round-trips as object not array', () => {
    const rules = [extractPick('README.md', 'docs/manual.txt')];
    const encoded = encodeExtract(rules);
    expect(Array.isArray(encoded)).toBe(false);
    expect(encoded).toMatchObject({
      file: 'README.md',
      into: 'docs/manual.txt',
    });
    const decoded = decode(encoded);
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
    expect(decode(encoded)).toHaveLength(2);
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
    const decoded = decode({ into: 'out/' });
    expect(decoded[0]!.kind).toBe('dump');
    if (decoded[0]!.kind === 'dump') expect(decoded[0]!.clean).toBeUndefined();
  });

  it('discriminates Pick / Scan / Dump by shape', () => {
    expect(decode({ file: 'a.txt', into: 'b.txt' })[0]!.kind).toBe('pick');
    expect(decode({ matches: '**/*.so', into: 'libs/' })[0]!.kind).toBe('scan');
    expect(decode({ into: 'dump/' })[0]!.kind).toBe('dump');
  });

  it('Scan rule encodes strip / includes / excludes', () => {
    const scan = extractScan('**/*.so', 'natives/', {
      strip: ['lib/'],
      includes: ['*.so'],
      excludes: ['*.txt'],
    });
    expect(scan.kind).toBe('scan');
    const encoded = encodeExtract([scan]);
    expect(encoded).toMatchObject({
      matches: '**/*.so',
      into: 'natives/',
      strip: ['lib/'],
      includes: ['*.so'],
      excludes: ['*.txt'],
    });
    expect(decode(encoded)[0]!.kind).toBe('scan');
  });

  it('Scan rule round-trips with no options', () => {
    const encoded = encodeExtract([extractScan('*.jar', 'mods/')]);
    expect(encoded).toEqual({ matches: '*.jar', into: 'mods/' });
  });
});
