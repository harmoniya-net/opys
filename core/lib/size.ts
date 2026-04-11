import { z } from 'zod';

const SizeSchema = z.union([
  z.object({ exact: z.number().int().nonnegative() }),
  z.object({ at_least: z.number().int().nonnegative() }),
  z.literal('unknown'),
]);

type SizeInner = z.infer<typeof SizeSchema>;

export class UnifactSize {
  constructor(private readonly inner: SizeInner) {}

  public static exact(bytes: number): UnifactSize {
    return new UnifactSize({ exact: bytes });
  }

  public static atLeast(bytes: number): UnifactSize {
    return new UnifactSize({ at_least: bytes });
  }

  public static unknown(): UnifactSize {
    return new UnifactSize('unknown');
  }

  /** Identity for the addition monoid: Exact(0) */
  public static zero(): UnifactSize {
    return UnifactSize.exact(0);
  }

  public static CODEC = z.codec(SizeSchema, z.instanceof(UnifactSize), {
    decode: (val) => new UnifactSize(val),
    encode: (size) => size.toJSON(),
  });

  /**
   * Commutative monoid addition:
   *   Exact(a) + Exact(b)   = Exact(a + b)
   *   AtLeast(a) + Exact(b) = AtLeast(a + b)
   *   Exact(a) + Unknown    = AtLeast(a)
   *   AtLeast(a) + Unknown  = AtLeast(a)
   *   Unknown + Unknown     = AtLeast(0)
   */
  public add(other: UnifactSize): UnifactSize {
    const aIsUnknown = this.inner === 'unknown';
    const bIsUnknown = other.inner === 'unknown';
    const aBytes = aIsUnknown
      ? 0
      : 'exact' in this.inner
        ? this.inner.exact
        : this.inner.at_least;
    const bBytes = bIsUnknown
      ? 0
      : 'exact' in other.inner
        ? other.inner.exact
        : other.inner.at_least;

    if (
      !aIsUnknown &&
      !bIsUnknown &&
      'exact' in this.inner &&
      'exact' in other.inner
    ) {
      return UnifactSize.exact(aBytes + bBytes);
    }

    return UnifactSize.atLeast(aBytes + bBytes);
  }

  public isExact(): boolean {
    return typeof this.inner === 'object' && 'exact' in this.inner;
  }

  public isAtLeast(): boolean {
    return typeof this.inner === 'object' && 'at_least' in this.inner;
  }

  public isUnknown(): boolean {
    return this.inner === 'unknown';
  }

  public bytes(): number | undefined {
    if (this.inner === 'unknown') return undefined;
    if ('exact' in this.inner) return this.inner.exact;
    return this.inner.at_least;
  }

  public toJSON(): SizeInner {
    return this.inner;
  }
}
