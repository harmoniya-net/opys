#!/usr/bin/env node
import { cmdBuild } from '../lib/commands/build';
import { cmdLaunch } from '../lib/commands/launch';
import { NetworkError, IntegrityError, ExtractionError } from '@torba/runtime';
import { VersionFetchError } from '@torba/mojang';
import { UsageError } from '../lib/errors';
import { Logger, parseLogLevel, type LogLevel } from '../lib/logger';

const USAGE = `\
torba — declarative manifest toolkit

USAGE
  torba build  [-i <torba.config.mjs>] [-o <out>] [--mode <m>]  Build manifest
  torba launch [-i <torba.config.mjs>] [--mode <m>]  Build, install, launch

OPTIONS
  -i, --input          Config file  (default: torba.config.mjs)
  -o, --output         Output file  (default: stdout for build)
  --mode <value>       Mode passed to config function (default: command name)
  --log-level <level>  Log verbosity: silent|error|warn|info|debug  (default: info)
  -v                   Shorthand for --log-level debug

EXIT CODES
  0  Success
  1  Usage or config error
  2  Network error
  3  Integrity check failure
  4  Extraction failure
`;

type CommandHandler = (
  args: string[],
  logger: Logger,
  command: string,
) => Promise<void>;

const COMMANDS: Record<string, CommandHandler> = {
  build: cmdBuild,
  launch: cmdLaunch,
};

/** Strip global flags from argv, returning the cleaned args and extracted values. */
function extractGlobals(argv: string[]): {
  args: string[];
  logLevel: LogLevel;
} {
  const args: string[] = [];
  let logLevel: LogLevel = 'info';
  let i = 0;
  while (i < argv.length) {
    const token = argv[i++]!;
    if (token === '--log-level') {
      logLevel = parseLogLevel(argv[i++]);
    } else if (token === '-v') {
      logLevel = 'debug';
    } else {
      args.push(token);
    }
  }
  return { args, logLevel };
}

async function main(): Promise<void> {
  const [, , ...allArgs] = process.argv;
  const { args, logLevel } = extractGlobals(allArgs ?? []);
  const [command, ...rest] = args;

  const logger = new Logger(logLevel);

  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`Unknown command '${command}'\n\n${USAGE}`);
    process.exit(1);
  }

  await handler(rest, logger, command);
}

main().catch((err) => {
  // UsageError — exit 1: user-fixable mistakes
  if (err instanceof UsageError) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
  // Network errors — exit 2: transient / connectivity issues
  if (err instanceof NetworkError || err instanceof VersionFetchError) {
    process.stderr.write(`Network error: ${err.message}\n`);
    process.exit(2);
  }
  // Integrity failure — exit 3: bad or corrupted cached files
  if (err instanceof IntegrityError) {
    process.stderr.write(`Integrity check failed:\n`);
    for (const p of err.paths) process.stderr.write(`  ${p}\n`);
    process.exit(3);
  }
  // Extraction failure — exit 4
  if (err instanceof ExtractionError) {
    process.stderr.write(`Extraction failed: ${err.message}\n`);
    if (err.cause instanceof Error)
      process.stderr.write(`  caused by: ${err.cause.message}\n`);
    process.exit(4);
  }
  // Fallback — unexpected internal error. Include the full stack so we
  // can pinpoint torba bugs vs config issues without needing to re-run
  // under a debugger. Set TORBA_QUIET=1 to suppress the stack.
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Unexpected error: ${msg}\n`);
  if (err instanceof Error && err.cause instanceof Error) {
    process.stderr.write(`  caused by: ${err.cause.message}\n`);
    if (err.cause.stack && !process.env.TORBA_QUIET) {
      process.stderr.write(`${err.cause.stack}\n`);
    }
  }
  if (err instanceof Error && err.stack && !process.env.TORBA_QUIET) {
    process.stderr.write(`${err.stack}\n`);
  }
  process.exit(1);
});
