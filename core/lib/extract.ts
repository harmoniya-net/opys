import { z } from 'zod';

// --- ExtractPick ---

const ExtractPickSchema = z.object({
  file: z.string(),
  into: z.string(),
});

export class ExtractPick {
  constructor(
    public readonly file: string,
    public readonly into: string,
  ) {}

  public static CODEC = z.codec(ExtractPickSchema, z.instanceof(ExtractPick), {
    decode: ({ file, into }) => new ExtractPick(file, into),
    encode: (pick) => pick,
  });
}

// --- ExtractScan ---

const ExtractScanSchema = z.object({
  matches: z.string(),
  into: z.string(),
  strip: z.array(z.string()).optional(),
  includes: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
});

export class ExtractScan {
  constructor(
    public readonly matches: string,
    public readonly into: string,
    public readonly strip: string[] | undefined,
    public readonly includes: string[] | undefined,
    public readonly excludes: string[] | undefined,
  ) {}

  public static CODEC = z.codec(ExtractScanSchema, z.instanceof(ExtractScan), {
    decode: ({ matches, into, strip, includes, excludes }) =>
      new ExtractScan(matches, into, strip, includes, excludes),
    encode: (scan) => scan,
  });
}

// --- ExtractDump ---

const ExtractDumpSchema = z.object({
  into: z.string(),
  clean: z.boolean().optional(),
  includes: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
});

export class ExtractDump {
  constructor(
    public readonly into: string,
    public readonly includes: string[] | undefined,
    public readonly excludes: string[] | undefined,
    public readonly clean: boolean = false,
  ) {}

  public static CODEC = z.codec(ExtractDumpSchema, z.instanceof(ExtractDump), {
    decode: ({ into, includes, excludes, clean }) =>
      new ExtractDump(into, includes, excludes, clean),
    encode: (dump) => dump,
  });
}

// --- ExtractRule discriminated union ---
// Disambiguation: `file` -> Pick, `matches` -> Scan, only `into` -> Dump

const ExtractRuleSchema = z.union([
  ExtractPickSchema,
  ExtractScanSchema,
  ExtractDumpSchema,
]);

export type ExtractRule = ExtractPick | ExtractScan | ExtractDump;

function decodeExtractRule(
  raw: z.infer<typeof ExtractRuleSchema>,
): ExtractRule {
  if ('file' in raw) return ExtractPick.CODEC.decode(raw);
  if ('matches' in raw) return ExtractScan.CODEC.decode(raw);
  return ExtractDump.CODEC.decode(raw);
}

function encodeExtractRule(
  rule: ExtractRule,
): z.infer<typeof ExtractRuleSchema> {
  if (rule instanceof ExtractPick) return ExtractPick.CODEC.encode(rule);
  if (rule instanceof ExtractScan) return ExtractScan.CODEC.encode(rule);
  return ExtractDump.CODEC.encode(rule as ExtractDump);
}

// --- Extract (single rule or array) ---

const ExtractInputSchema = z.union([
  ExtractRuleSchema,
  z.array(ExtractRuleSchema),
]);

export class Extract {
  constructor(private readonly rules: ExtractRule[]) {}

  public static CODEC = z.codec(ExtractInputSchema, z.instanceof(Extract), {
    decode: (val) => {
      const arr = Array.isArray(val) ? val : [val];
      return new Extract(arr.map(decodeExtractRule));
    },
    encode: (extract) => extract.toJSON(),
  });

  [Symbol.iterator]() {
    return this.rules[Symbol.iterator]();
  }

  public get length() {
    return this.rules.length;
  }

  public toJSON(): z.infer<typeof ExtractInputSchema> {
    const encoded = this.rules.map(encodeExtractRule);
    if (encoded.length === 1) return encoded[0]!;
    return encoded;
  }
}
