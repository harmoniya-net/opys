import { z } from 'zod';

export interface ExtractPick {
  readonly kind: 'pick';
  readonly file: string;
  readonly into: string;
}

export interface ExtractScan {
  readonly kind: 'scan';
  readonly matches: string;
  readonly into: string;
  readonly strip?: string[];
  readonly includes?: string[];
  readonly excludes?: string[];
}

export interface ExtractDump {
  readonly kind: 'dump';
  readonly into: string;
  readonly clean?: boolean;
  readonly includes?: string[];
  readonly excludes?: string[];
}

export type ExtractRule = ExtractPick | ExtractScan | ExtractDump;

const ExtractRuleSchema = z.union([
  z
    .object({ file: z.string(), into: z.string() })
    .transform((d): ExtractPick => ({ kind: 'pick', ...d })),
  z
    .object({
      matches: z.string(),
      into: z.string(),
      strip: z.array(z.string()).optional(),
      includes: z.array(z.string()).optional(),
      excludes: z.array(z.string()).optional(),
    })
    .transform((d): ExtractScan => ({ kind: 'scan', ...d })),
  z
    .object({
      into: z.string(),
      clean: z.boolean().optional(),
      includes: z.array(z.string()).optional(),
      excludes: z.array(z.string()).optional(),
    })
    .transform((d): ExtractDump => ({ kind: 'dump', ...d })),
]);

/** Parses a single rule or an array of rules; always produces an array. */
export const ExtractSchema: z.ZodType<ExtractRule[]> = z
  .union([ExtractRuleSchema, z.array(ExtractRuleSchema)])
  .transform((v): ExtractRule[] =>
    Array.isArray(v) ? v : [v],
  ) as unknown as z.ZodType<ExtractRule[]>;

export function encodeExtractRule(rule: ExtractRule): unknown {
  const { kind, ...rest } = rule;
  return rest;
}

export function encodeExtract(rules: ExtractRule[]): unknown {
  const encoded = rules.map(encodeExtractRule);
  return encoded.length === 1 ? encoded[0] : encoded;
}

// Factory functions
export const extractPick = (file: string, into: string): ExtractPick => ({
  kind: 'pick',
  file,
  into,
});
export const extractScan = (
  matches: string,
  into: string,
  opts?: Omit<ExtractScan, 'kind' | 'matches' | 'into'>,
): ExtractScan => ({ kind: 'scan', matches, into, ...opts });
export const extractDump = (
  into: string,
  opts?: Omit<ExtractDump, 'kind' | 'into'>,
): ExtractDump => ({ kind: 'dump', into, ...opts });
