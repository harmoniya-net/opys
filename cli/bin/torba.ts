#!/usr/bin/env node
import { cmdBuild } from '../lib/commands/build';
import { cmdInit } from '../lib/commands/init';
import { cmdLaunch } from '../lib/commands/launch';
import {
  NetworkError,
  IntegrityError,
  ExtractionError,
} from '@torba/installer';
import { VersionFetchError } from '@torba/mojang';
import { UsageError } from '../lib/errors';
import { Logger, parseLogLevel, type LogLevel } from '../lib/logger';

const USAGE = `\
torba — declarative manifest toolkit

USAGE
  torba init   [-o <torba.config.mjs>] [--name <n>] [--version <v>] [--forge] [--force] [--install|--no-install]
  torba build  [-i <torba.config.mjs>] [-o <out>] [--mode <m>]  Build manifest
  torba launch [-i <torba.config.mjs>] [--var K=V] [--mode <m>]  Install and launch

OPTIONS
  -i, --input          Config file  (default: torba.config.mjs)
  -o, --output         Output file  (default: stdout for build; torba.config.mjs for init)
  --var KEY=VAL        Override a manifest variable (repeatable; launch only)
  --mode <value>       Mode passed to config function (default: command name)
  --name <appName>     Application name for init (default: cwd basename)
  --version <mc>       Minecraft version for init (default: 1.20.1)
  --forge              Scaffold a Forge config instead of vanilla (init only)
  --force              Overwrite an existing config (init only)
  --install            Auto-install runtime deps after init (skips prompt)
  --no-install         Skip the install step (skips prompt)
  --log-level <level>  Log verbosity: silent|error|warn|info|debug  (default: info)
  -v                   Shorthand for --log-level debug

EXIT CODES
  0  Success
  1  Usage or config error
  2  Network error
  3  Integrity check failure
  4  Extraction failure
`;

type CommandHandler = (args: string[], logger: Logger) => Promise<void>;

const COMMANDS: Record<string, CommandHandler> = {
  init: cmdInit,
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

  await handler(rest, logger);
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
