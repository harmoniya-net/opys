import { UsageError } from './errors';

export interface FlagSpec {
  long: string; // long flag name without dashes, e.g. 'input'
  short?: string; // single-char alias without dash, e.g. 'i'
  type: 'string' | 'boolean' | 'pairs';
}

export interface ParsedArgs {
  getString(flag: string): string | undefined;
  getBoolean(flag: string): boolean;
  /** Accumulated KEY=VALUE pairs for a 'pairs' flag (e.g. --var). */
  getPairs(flag: string): Readonly<Record<string, string>>;
  readonly positional: readonly string[];
}

export function parseArgs(argv: string[], specs: FlagSpec[]): ParsedArgs {
  const index = buildIndex(specs);
  const strings = new Map<string, string>();
  const booleans = new Set<string>();
  const pairsMap = new Map<string, Record<string, string>>();
  const positional: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const token = argv[i++]!;
    const spec = index.get(token);

    if (!spec) {
      if (token.startsWith('-')) throw new UsageError(`Unknown flag: ${token}`);
      positional.push(token);
      continue;
    }

    if (spec.type === 'boolean') {
      booleans.add(spec.long);
    } else if (spec.type === 'string') {
      const val = argv[i++];
      if (val === undefined) throw new UsageError(`${token} requires a value`);
      strings.set(spec.long, val);
    } else {
      // pairs: expects next token in KEY=VALUE form
      const val = argv[i++];
      if (val === undefined)
        throw new UsageError(`${token} requires KEY=VALUE`);
      const eq = val.indexOf('=');
      if (eq === -1)
        throw new UsageError(`${token} requires KEY=VALUE, got: ${val}`);
      const bucket = pairsMap.get(spec.long) ?? {};
      bucket[val.slice(0, eq)] = val.slice(eq + 1);
      pairsMap.set(spec.long, bucket);
    }
  }

  return {
    getString: (flag) => strings.get(flag),
    getBoolean: (flag) => booleans.has(flag),
    getPairs: (flag) => pairsMap.get(flag) ?? {},
    positional,
  };
}

function buildIndex(specs: FlagSpec[]): Map<string, FlagSpec> {
  return new Map(
    specs.flatMap((spec): [string, FlagSpec][] => [
      [`--${spec.long}`, spec],
      ...(spec.short ? [[`-${spec.short}`, spec] as [string, FlagSpec]] : []),
    ]),
  );
}
