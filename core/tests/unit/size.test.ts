import { describe, expect, it } from 'vitest';
import { UnifactSize } from '../../lib/size';

describe('UnifactSize', () => {
  it('sum exact + exact = exact', () => {
    const result = UnifactSize.exact(1).add(UnifactSize.exact(2));
    expect(result).toEqual(UnifactSize.exact(3));
  });

  it('sum exact + at_least = at_least', () => {
    const result = UnifactSize.exact(1).add(UnifactSize.atLeast(2));
    expect(result).toEqual(UnifactSize.atLeast(3));
  });

  it('sum at_least + at_least = at_least', () => {
    const result = UnifactSize.atLeast(1).add(UnifactSize.atLeast(2));
    expect(result).toEqual(UnifactSize.atLeast(3));
  });

  it('sum with unknown: unknown contributes 0, result is at_least', () => {
    const result = UnifactSize.exact(1)
      .add(UnifactSize.atLeast(2))
      .add(UnifactSize.unknown());
    expect(result).toEqual(UnifactSize.atLeast(3));
  });

  it('sum empty = exact(0)', () => {
    const result = [].reduce(
      (acc: UnifactSize, s: UnifactSize) => acc.add(s),
      UnifactSize.zero(),
    );
    expect(result).toEqual(UnifactSize.exact(0));
  });
});
