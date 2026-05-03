import { parseArgs as nodeParseArgs, type ParseArgsConfig } from 'node:util';
import { UsageError } from './errors';

type OptionType = 'string' | 'boolean';

export interface FlagSpec {
  long: string;
  short?: string;
  type: OptionType | 'pairs';
}

export interface ParsedArgs {
  getString(flag: string): string | undefined;
  getBoolean(flag: string): boolean;
  /** Accumulated KEY=VALUE pairs for a 'pairs' flag (e.g. --var). */
  getPairs(flag: string): Readonly<Record<string, string>>;
  readonly positional: readonly string[];
}

export function parseArgs(argv: string[], specs: FlagSpec[]): ParsedArgs {
  const options: ParseArgsConfig['options'] = {};
  for (const s of specs) {
    options[s.long] = {
      type: s.type === 'boolean' ? 'boolean' : 'string',
      ...(s.short ? { short: s.short } : {}),
      ...(s.type === 'pairs' ? { multiple: true } : {}),
    };
  }

  let parsed;
  try {
    parsed = nodeParseArgs({
      args: argv,
      options,
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }

  const pairsMap: Record<string, Record<string, string>> = {};
  for (const s of specs) {
    if (s.type !== 'pairs') continue;
    const raw = parsed.values[s.long] as string[] | undefined;
    if (!raw) continue;
    const bucket: Record<string, string> = {};
    for (const v of raw) {
      const eq = v.indexOf('=');
      if (eq === -1)
        throw new UsageError(`--${s.long} requires KEY=VALUE, got: ${v}`);
      bucket[v.slice(0, eq)] = v.slice(eq + 1);
    }
    pairsMap[s.long] = bucket;
  }

  return {
    getString: (flag) => parsed.values[flag] as string | undefined,
    getBoolean: (flag) => parsed.values[flag] === true,
    getPairs: (flag) => pairsMap[flag] ?? {},
    positional: parsed.positionals,
  };
}
