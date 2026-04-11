import { z } from 'zod';
import { ShortRuleset, Ruleset } from '@unifest/rules';
import type { SatisfiesOsOptions } from '@unifest/rules';
import { Source } from './source';
import { Integrity } from './integrity';
import { UnifactSize } from './size';
import { Extract } from './extract';

const UnifactSchema = z.object({
  path: z.string(),
  source: Source.CODEC,
  size: UnifactSize.CODEC.default(UnifactSize.unknown()),
  rules: ShortRuleset.default(Ruleset.empty()),
  integrity: Integrity.CODEC.default(Integrity.skip()),
  metadata: z.unknown().optional(),
  extract: Extract.CODEC.optional(),
});

export class Unifact {
  constructor(
    public readonly path: string,
    public readonly source: Source,
    public readonly size: UnifactSize,
    public readonly rules: Ruleset,
    public readonly integrity: Integrity,
    public readonly metadata: unknown,
    public readonly extract: Extract | undefined,
  ) {}

  public static CODEC = z.codec(UnifactSchema, z.instanceof(Unifact), {
    decode: ({ path, source, size, rules, integrity, metadata, extract }) =>
      new Unifact(path, source, size, rules, integrity, metadata, extract),
    encode: (unifact) => ({
      path: unifact.path,
      source: unifact.source,
      size: unifact.size,
      rules: unifact.rules,
      integrity: unifact.integrity,
      metadata: unifact.metadata,
      extract: unifact.extract,
    }),
  });

  /** Returns true if this unifact applies to the given platform. */
  public applies(options: SatisfiesOsOptions, feats: string[] = []): boolean {
    return this.rules.satisfies(options, feats);
  }

  public toJSON() {
    return {
      path: this.path,
      source: Source.CODEC.encode(this.source),
      size: UnifactSize.CODEC.encode(this.size),
      rules: ShortRuleset.encode(this.rules),
      integrity: Integrity.CODEC.encode(this.integrity),
      metadata: this.metadata,
      extract:
        this.extract !== undefined
          ? Extract.CODEC.encode(this.extract)
          : undefined,
    };
  }
}
