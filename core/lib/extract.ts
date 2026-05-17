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

const ExtractPickWire = z.object({ file: z.string(), into: z.string() });
const ExtractScanWire = z.object({
  matches: z.string(),
  into: z.string(),
  strip: z.array(z.string()).optional(),
  includes: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
});
const ExtractDumpWire = z.object({
  into: z.string(),
  clean: z.boolean().optional(),
  includes: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
});

const ExtractRuleWireSchema = z.union([
  ExtractPickWire,
  ExtractScanWire,
  ExtractDumpWire,
]);

/** Wire shape — a single rule or an array of rules. */
export const ExtractWireSchema = z.union([
  ExtractRuleWireSchema,
  z.array(ExtractRuleWireSchema),
]);
type ExtractRuleWire = z.infer<typeof ExtractRuleWireSchema>;
export type ExtractWire = z.infer<typeof ExtractWireSchema>;

function decodeExtractRule(raw: ExtractRuleWire): ExtractRule {
  if ('file' in raw) return { kind: 'pick', ...raw };
  if ('matches' in raw) return { kind: 'scan', ...raw };
  return { kind: 'dump', ...raw };
}

/** Total decode — always produces an array of tagged rules. */
export function decodeExtract(raw: ExtractWire): ExtractRule[] {
  return Array.isArray(raw)
    ? raw.map(decodeExtractRule)
    : [decodeExtractRule(raw)];
}

function encodeExtractRule(rule: ExtractRule): ExtractRuleWire {
  switch (rule.kind) {
    case 'pick':
      return { file: rule.file, into: rule.into };
    case 'scan':
      return {
        matches: rule.matches,
        into: rule.into,
        ...(rule.strip ? { strip: rule.strip } : {}),
        ...(rule.includes ? { includes: rule.includes } : {}),
        ...(rule.excludes ? { excludes: rule.excludes } : {}),
      };
    case 'dump':
      return {
        into: rule.into,
        ...(rule.clean !== undefined ? { clean: rule.clean } : {}),
        ...(rule.includes ? { includes: rule.includes } : {}),
        ...(rule.excludes ? { excludes: rule.excludes } : {}),
      };
  }
}

export function encodeExtract(rules: ExtractRule[]): ExtractWire {
  const encoded = rules.map(encodeExtractRule);
  return encoded.length === 1 ? encoded[0]! : encoded;
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
