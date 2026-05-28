import type { ProgressWriter } from './progress';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const RANK: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

const LEVEL_PREFIX: Partial<Record<LogLevel, string>> = {
  error: '[error]',
  warn: '[warn] ',
  debug: '[debug]',
};

/**
 * Level-aware logger that writes to stderr.
 * Coordinates with a {@link ProgressWriter} to clear the progress bar before
 * writing debug/warn lines so they don't mangle in-flight progress output.
 */
export class Logger {
  private readonly t0 = Date.now();
  private pw?: ProgressWriter;

  constructor(readonly level: LogLevel) {}

  /** Attach a ProgressWriter so log lines clear the bar before printing. */
  setProgressWriter(pw: ProgressWriter): void {
    this.pw = pw;
  }

  error(msg: string): void {
    this.emit('error', msg);
  }
  warn(msg: string): void {
    this.emit('warn', msg);
  }
  info(msg: string): void {
    this.emit('info', msg);
  }
  debug(msg: string): void {
    this.emit('debug', msg);
  }

  /** Returns true when `level` is at or below this logger's threshold. */
  enables(level: LogLevel): boolean {
    return RANK[level] <= RANK[this.level];
  }

  /** Returns an `InstallOptions`-compatible log callback. */
  installerLog(): (level: 'debug' | 'warn', msg: string) => void {
    return (level, msg) => this.emit(level, msg);
  }

  private emit(level: LogLevel, msg: string): void {
    if (!this.enables(level)) return;
    this.pw?.clear();
    const prefix = LEVEL_PREFIX[level];
    const line = prefix
      ? `${prefix} +${Date.now() - this.t0}ms ${msg}\n`
      : `${msg}\n`;
    process.stderr.write(line);
    this.pw?.redraw();
  }
}

/** Parse a log level from a string, defaulting to 'info' on unknown values. */
export function parseLogLevel(raw: string | undefined): LogLevel {
  if (!raw) return 'info';
  if (Object.prototype.hasOwnProperty.call(RANK, raw)) return raw as LogLevel;
  process.stderr.write(
    `[warn]  Unknown log level '${raw}', defaulting to 'info'\n`,
  );
  return 'info';
}
