import type { SatisfiesOsOptions } from '@unifest/rules';
import { z } from 'zod';
import { Launch } from './launch';
import { UnifactSize } from './size';
import { Unifact } from './unifact';
import { ValDefs } from './valdefs';

const UnifestSchema = z.object({
  vars: ValDefs.CODEC.default(ValDefs.empty()),
  launch: Launch.CODEC.optional(),
  unifacts: z.array(Unifact.CODEC).default([]),
});

export class Unifest {
  constructor(
    public readonly vars: ValDefs,
    public readonly launch: Launch | undefined,
    public readonly unifacts: Unifact[],
  ) {}

  public static CODEC = z.codec(UnifestSchema, z.instanceof(Unifest), {
    decode: ({ vars, launch, unifacts }) => new Unifest(vars, launch, unifacts),
    encode: (unifest) => ({
      vars: unifest.vars,
      launch: unifest.launch,
      unifacts: unifest.unifacts,
    }),
  });

  /**
   * Parse a Unifest from a string. Detects JSON by leading `{`, falls back to TOML.
   */
  public static async parse(input: string): Promise<Unifest> {
    const trimmed = input.trimStart();
    if (trimmed.startsWith('{')) {
      try {
        return Unifest.CODEC.decode(JSON.parse(input));
      } catch (e) {
        throw new Error(`Failed to parse manifest as JSON: ${e}`);
      }
    }
    try {
      const { parse: parseTOML } = await import('smol-toml');
      return Unifest.CODEC.decode(parseTOML(input));
    } catch (e) {
      throw new Error(`Failed to parse manifest as TOML: ${e}`);
    }
  }

  /**
   * Filter unifacts to only those that apply to the given platform.
   */
  public filter(options: SatisfiesOsOptions, feats: string[] = []): Unifest {
    return new Unifest(
      this.vars,
      this.launch,
      this.unifacts.filter((u) => u.applies(options, feats)),
    );
  }

  /**
   * Total size of all unifacts (monoid sum).
   */
  public totalSize(): UnifactSize {
    return this.unifacts.reduce(
      (acc, u) => acc.add(u.size),
      UnifactSize.zero(),
    );
  }

  /**
   * Merge another Unifest into this one (other's launch wins if defined).
   */
  public merge(other: Unifest): Unifest {
    return new Unifest(
      this.vars.concat(other.vars),
      other.launch ?? this.launch,
      [...this.unifacts, ...other.unifacts],
    );
  }

  public toJSON() {
    return {
      vars: ValDefs.CODEC.encode(this.vars),
      launch:
        this.launch !== undefined
          ? Launch.CODEC.encode(this.launch)
          : undefined,
      unifacts: this.unifacts.map((u) => Unifact.CODEC.encode(u)),
    };
  }
}
