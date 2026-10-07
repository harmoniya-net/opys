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

  it('collects a repeatable flag in the order given', () => {
    const specs: FlagSpec[] = [...SPECS, { long: 'var', type: 'strings' }];
    const args = parseArgs(['--var', 'a=1', '--var', 'b=2'], specs);
    expect(args.getStrings('var')).toEqual(['a=1', 'b=2']);
    expect(parseArgs([], specs).getStrings('var')).toEqual([]);
  });

  it('returns what is not a flag as positionals', () => {
    const args = parseArgs(['game.opys', '-i', 'cfg.mjs', 'extra'], SPECS);
    expect(args.positionals).toEqual(['game.opys', 'extra']);
    expect(parseArgs([], SPECS).positionals).toEqual([]);
  });

  it('works with an empty spec list', () => {
    expect(() => parseArgs([], [])).not.toThrow();
  });
});
