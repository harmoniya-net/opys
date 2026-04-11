import { z } from 'zod';
import { InlineRulesetSchema, Ruleset } from '@unifest/rules';
import type { SatisfiesOsOptions } from '@unifest/rules';

// A single conditional variable value
const ValDefSchema = z.union([
  z.string(),
  z.object({
    value: z.string(),
    rules: InlineRulesetSchema,
  }),
]);

type ValDefInner = z.infer<typeof ValDefSchema>;

export class ValDef {
  constructor(
    public readonly value: string,
    public readonly rules: Ruleset,
  ) {}

  public static CODEC = z.codec(ValDefSchema, z.instanceof(ValDef), {
    decode: (val) =>
      typeof val === 'string'
        ? new ValDef(val, Ruleset.empty())
        : new ValDef(val.value, val.rules),
    encode: (def) =>
      def.rules.length === 0
        ? def.value
        : { value: def.value, rules: def.rules },
  });

  public satisfies(options: SatisfiesOsOptions, feats: string[] = []): boolean {
    return this.rules.satisfies(options, feats);
  }

  public toJSON(): ValDefInner {
    if (this.rules.length === 0) return this.value;
    return { value: this.value, rules: InlineRulesetSchema.encode(this.rules) };
  }
}

// ValDefs: ordered list of [key, val] entries (allows duplicate keys)
// Accepts both map form { key: val } and sequence form [[key, val], ...]

const ValDefsSchema = z.union([
  z.array(z.tuple([z.string(), ValDef.CODEC])),
  z.record(z.string(), ValDef.CODEC),
]);

type ValDefsJSON = [string, ReturnType<ValDef['toJSON']>][];

export class ValDefs {
  constructor(private readonly entries: [string, ValDef][]) {}

  public static empty(): ValDefs {
    return new ValDefs([]);
  }

  public static CODEC = z.codec(ValDefsSchema, z.instanceof(ValDefs), {
    decode: (val) => {
      const entries: [string, ValDef][] = Array.isArray(val)
        ? val
        : Object.entries(val).sort(([a], [b]) => a.localeCompare(b));
      return new ValDefs(entries);
    },
    encode: (defs) => [...defs] as [string, ValDef][],
  });

  /**
   * Resolve variables: for each key, the last matching entry wins.
   * Returns a flat key→value map (no interpolation applied here).
   */
  public resolve(
    options: SatisfiesOsOptions,
    feats: string[] = [],
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, def] of this.entries) {
      if (def.satisfies(options, feats)) {
        result[key] = def.value;
      }
    }
    return result;
  }

  /** Append entries from another ValDefs (later entries shadow earlier on conflict). */
  public concat(other: ValDefs): ValDefs {
    return new ValDefs([...this.entries, ...other.entries]);
  }

  [Symbol.iterator]() {
    return this.entries[Symbol.iterator]();
  }

  public get length() {
    return this.entries.length;
  }

  public toJSON(): ValDefsJSON {
    return this.entries.map(([key, def]) => [key, def.toJSON()]);
  }
}
