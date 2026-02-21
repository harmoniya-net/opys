import { z } from 'zod';
import { FeatureMap } from './features';
import { RuleOs } from './os';
import type { SatisfiesOsOptions } from './satisfies';

export enum RuleAction {
  Allow = 'allow',
  Disallow = 'disallow',
}

export const RuleActionSchema = z.enum(RuleAction).or(z.string());

export const RuleSchema = z.union([
  z.object({ action: RuleActionSchema, os: RuleOs.CODEC }),
  z.object({ action: RuleActionSchema, features: FeatureMap.CODEC }),
  z.object({ action: RuleActionSchema }),
]);

export class Rule {
  constructor(private inner: z.infer<typeof RuleSchema>) {}

  public static CODEC = z.codec(RuleSchema, z.instanceof(Rule), {
    decode: (obj) => new Rule(obj),
    encode: (rule) => rule.toJSON(),
  });

  public satisfies(options: SatisfiesOsOptions, feats: string[] = []): boolean {
    const allow = this.inner.action === RuleAction.Allow;

    if ('os' in this.inner) {
      return this.inner.os.satisfies(options) === allow;
    }

    if ('features' in this.inner) {
      return this.inner.features.satisfies(feats) === allow;
    }

    return allow;
  }

  public toJSON() {
    return this.inner;
  }
}
