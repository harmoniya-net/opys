import { parseArgs as nodeParseArgs, type ParseArgsConfig } from 'node:util';
import { UsageError } from './errors';

/** `strings` is a flag that may be given more than once. */
type OptionType = 'string' | 'strings';

export interface FlagSpec {
  long: string;
  short?: string;
  type: OptionType;
}

export interface ParsedArgs {
  getString(flag: string): string | undefined;
  /** Every value a `strings` flag was given, in order; empty if it was not. */
  getStrings(flag: string): string[];
  /** The arguments that are not flags, in order. */
  positionals: string[];
}

export function parseArgs(argv: string[], specs: FlagSpec[]): ParsedArgs {
  const options: ParseArgsConfig['options'] = {};
  for (const s of specs) {
    options[s.long] = {
      type: 'string',
      ...(s.type === 'strings' ? { multiple: true } : {}),
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
    getStrings: (flag) => (parsed.values[flag] as string[] | undefined) ?? [],
    positionals: parsed.positionals,
  };
}
