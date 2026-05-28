import { describe, expect, test } from 'vitest';
import { parseValset } from '../../lib';

describe('parseValset', () => {
  test('string entries become single-value, no-rules vals', () => {
    expect(parseValset(['-Xmx2G'])).toEqual([{ rules: [], value: ['-Xmx2G'] }]);
  });

  test('object entry with scalar value wraps to a one-element array', () => {
    expect(
      parseValset([{ value: '--linux-flag', rules: 'allow.os.linux' }]),
    ).toEqual([
      {
        rules: [{ action: 'allow', os: { name: 'linux' } }],
        value: ['--linux-flag'],
      },
    ]);
  });

  test('object entry with array value preserves it', () => {
    expect(parseValset([{ value: ['-a', '-b'] }])).toEqual([
      { rules: [], value: ['-a', '-b'] },
    ]);
  });

  test('rules field is shorthand-expanded', () => {
    expect(
      parseValset([
        { value: 'x', rules: ['allow.os.linux', 'disallow.os.windows'] },
      ]),
    ).toEqual([
      {
        rules: [
          { action: 'allow', os: { name: 'linux' } },
          { action: 'disallow', os: { name: 'windows' } },
        ],
        value: ['x'],
      },
    ]);
  });

  test('mixes string and object entries', () => {
    expect(
      parseValset([
        '-Xmx2G',
        { value: '-XstartOnFirstThread', rules: 'allow.os.osx' },
      ]),
    ).toEqual([
      { rules: [], value: ['-Xmx2G'] },
      {
        rules: [{ action: 'allow', os: { name: 'osx' } }],
        value: ['-XstartOnFirstThread'],
      },
    ]);
  });

  test('rejects non-array input', () => {
    expect(() => parseValset({} as unknown)).toThrow(/expected an array/);
  });

  test('rejects entries that are neither string nor object', () => {
    expect(() => parseValset([42 as unknown])).toThrow(/invalid entry/);
  });
});
