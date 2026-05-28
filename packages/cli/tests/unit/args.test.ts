import { describe, expect, it } from 'vitest';
import { parseArgs, type FlagSpec } from '../../lib/args';
import { UsageError } from '../../lib/errors';

const SPECS: FlagSpec[] = [
  { long: 'input', short: 'i', type: 'string' },
  { long: 'mode', type: 'string' },
];

describe('parseArgs', () => {
  it('parses a long string flag', () => {
    const args = parseArgs(['--input', 'cfg.mjs'], SPECS);
    expect(args.getString('input')).toBe('cfg.mjs');
  });

  it('parses a short string flag', () => {
    const args = parseArgs(['-i', 'cfg.mjs'], SPECS);
    expect(args.getString('input')).toBe('cfg.mjs');
  });

  it('returns undefined for an unset string flag', () => {
    const args = parseArgs([], SPECS);
    expect(args.getString('input')).toBeUndefined();
  });

  it('throws a UsageError on an unknown flag', () => {
    expect(() => parseArgs(['--nope'], SPECS)).toThrow(UsageError);
  });

  it('throws a UsageError when a string flag is missing its value', () => {
    expect(() => parseArgs(['--mode'], SPECS)).toThrow(UsageError);
  });

  it('works with an empty spec list', () => {
    expect(() => parseArgs([], [])).not.toThrow();
  });
});
