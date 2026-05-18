import { parseArgs as nodeParseArgs, type ParseArgsConfig } from 'node:util';
import { UsageError } from './errors';

type OptionType = 'string' | 'boolean';

export interface FlagSpec {
  long: string;
  short?: string;
  type: OptionType;
}

export interface ParsedArgs {
  getString(flag: string): string | undefined;
  getBoolean(flag: string): boolean;
  readonly positional: readonly string[];
}

export function parseArgs(argv: string[], specs: FlagSpec[]): ParsedArgs {
  const options: ParseArgsConfig['options'] = {};
  for (const s of specs) {
    options[s.long] = {
      type: s.type,
      ...(s.short ? { short: s.short } : {}),
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

  return {
    getString: (flag) => parsed.values[flag] as string | undefined,
    getBoolean: (flag) => parsed.values[flag] === true,
    positional: parsed.positionals,
  };
}
