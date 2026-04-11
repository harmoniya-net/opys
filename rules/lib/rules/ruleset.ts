import { z } from 'zod';
import { RuleOsName } from './os';
import { Rule } from './rule';
import type { SatisfiesOsOptions } from './satisfies';

export class Ruleset {
  constructor(private readonly inner: Rule[]) {}

  public static CODEC = z.codec(z.array(Rule.CODEC), z.instanceof(Ruleset), {
    decode: (rules) => new Ruleset(rules),
    encode: (ruleset) => ruleset.toJSON(),
  });

  public static empty() {
    return new Ruleset([]);
  }

  public static allowOs(name: RuleOsName) {
    return new Ruleset([Rule.allowOs(name)]);
  }

  [Symbol.iterator]() {
    return this.inner[Symbol.iterator]();
  }

  public get length() {
    return this.inner.length;
  }

  public satisfies(options: SatisfiesOsOptions, feats: string[] = []): boolean {
    return this.inner.every((rule) => rule.satisfies(options, feats));
  }

  public toJSON() {
    return this.inner;
  }
}
