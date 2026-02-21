import z from 'zod';
import { Ruleset } from './rules';
import type { SatisfiesOsOptions } from './rules/satisfies';

export class Val {
  constructor(
    public readonly rules: Ruleset,
    public readonly value: string[],
  ) {}

  public static CODEC = z.codec(
    z
      .object({
        rules: Ruleset.CODEC,
        value: z.array(z.string()).or(z.string()),
      })
      .or(z.string()),
    z.instanceof(Val),
    {
      decode: (val) =>
        typeof val === 'string'
          ? new Val(Ruleset.empty(), [val])
          : new Val(val.rules, [val.value].flat()),
      encode: (val) => val.toJSON(),
    },
  );

  public satisfies(options: SatisfiesOsOptions, feats: string[] = []): boolean {
    return this.rules.satisfies(options, feats);
  }

  public toJSON() {
    if (this.rules.length === 0 && this.value.length === 1) {
      return this.value[0]!;
    }

    return this;
  }
}

export class Valset {
  constructor(private readonly inner: Val[]) {}

  public static CODEC = z.codec(z.array(Val.CODEC), z.instanceof(Valset), {
    decode: (vals) => new Valset(vals),
    encode: (valset) => valset.toJSON(),
  });

  [Symbol.iterator]() {
    return this.inner[Symbol.iterator]();
  }

  public get length() {
    return this.inner.length;
  }

  public resolve(options: SatisfiesOsOptions, feats: string[] = []): string[] {
    return this.inner.reduce((acc, val) => {
      return val.satisfies(options, feats) ? acc.concat(val.value) : acc;
    }, [] as string[]);
  }

  public toJSON() {
    return this.inner;
  }
}
