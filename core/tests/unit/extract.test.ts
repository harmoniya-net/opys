import { describe, expect, it } from 'vitest';
import {
  Extract,
  ExtractDump,
  ExtractPick,
  ExtractScan,
} from '../../lib/extract';

describe('Extract codec', () => {
  it('single rule round-trips as object not array', () => {
    const extract = new Extract([
      new ExtractPick('README.md', 'docs/manual.txt'),
    ]);

    const encoded = Extract.CODEC.encode(extract);
    // single rule → plain object, not wrapped in array
    expect(Array.isArray(encoded)).toBe(false);
    expect(encoded).toMatchObject({
      file: 'README.md',
      into: 'docs/manual.txt',
    });

    const decoded = Extract.CODEC.decode(encoded);
    expect(decoded).toBeInstanceOf(Extract);
    expect([...decoded]).toHaveLength(1);
    expect([...decoded][0]).toBeInstanceOf(ExtractPick);
  });

  it('multiple rules round-trip as array', () => {
    const extract = new Extract([
      new ExtractPick('README.md', 'docs/manual.txt'),
      new ExtractDump('dump/', undefined, undefined),
    ]);

    const encoded = Extract.CODEC.encode(extract);
    expect(Array.isArray(encoded)).toBe(true);
    expect(encoded).toHaveLength(2);

    const decoded = Extract.CODEC.decode(encoded);
    expect([...decoded]).toHaveLength(2);
  });

  it('Dump rule includes clean field', () => {
    const dump = new ExtractDump('natives/', undefined, ['META-INF/'], true);
    const encoded = ExtractDump.CODEC.encode(dump);
    expect(encoded).toMatchObject({
      into: 'natives/',
      excludes: ['META-INF/'],
      clean: true,
    });

    const decoded = ExtractDump.CODEC.decode(encoded);
    expect(decoded.clean).toBe(true);
    expect(decoded.excludes).toEqual(['META-INF/']);
  });

  it('Dump rule clean defaults to false', () => {
    const decoded = ExtractDump.CODEC.decode({ into: 'out/' });
    expect(decoded.clean).toBe(false);
  });

  it('discriminates Pick / Scan / Dump by shape', () => {
    const pickJson = { file: 'a.txt', into: 'b.txt' };
    const scanJson = { matches: '**/*.so', into: 'libs/' };
    const dumpJson = { into: 'dump/' };

    expect(Extract.CODEC.decode(pickJson)).toBeInstanceOf(Extract);
    expect([...Extract.CODEC.decode(pickJson)][0]).toBeInstanceOf(ExtractPick);
    expect([...Extract.CODEC.decode(scanJson)][0]).toBeInstanceOf(ExtractScan);
    expect([...Extract.CODEC.decode(dumpJson)][0]).toBeInstanceOf(ExtractDump);
  });
});
