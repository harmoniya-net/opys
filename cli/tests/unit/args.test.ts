import { describe, expect, it } from 'vitest';
import { parseArgs, type FlagSpec } from '../../lib/args';
import { UsageError } from '../../lib/errors';

const SPECS: FlagSpec[] = [
  { long: 'input', short: 'i', type: 'string' },
  { long: 'force', type: 'boolean' },
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

  it('parses a boolean flag as true when present', () => {
    const args = parseArgs(['--force'], SPECS);
    expect(args.getBoolean('force')).toBe(true);
  });

  it('returns false for an absent boolean flag', () => {
    const args = parseArgs([], SPECS);
    expect(args.getBoolean('force')).toBe(false);
  });

  it('collects positional arguments', () => {
    const args = parseArgs(['build', 'extra'], SPECS);
    expect(args.positional).toEqual(['build', 'extra']);
  });

  it('mixes flags and positionals', () => {
    const args = parseArgs(['build', '--input', 'c.mjs', '--force'], SPECS);
    expect(args.positional).toEqual(['build']);
    expect(args.getString('input')).toBe('c.mjs');
    expect(args.getBoolean('force')).toBe(true);
  });

  it('throws a UsageError on an unknown flag', () => {
    expect(() => parseArgs(['--nope'], SPECS)).toThrow(UsageError);
  });

  it('throws a UsageError when a string flag is missing its value', () => {
    expect(() => parseArgs(['--force=oops'], SPECS)).toThrow(UsageError);
  });

  it('works with an empty spec list', () => {
    const args = parseArgs(['a', 'b'], []);
    expect(args.positional).toEqual(['a', 'b']);
  });
});
