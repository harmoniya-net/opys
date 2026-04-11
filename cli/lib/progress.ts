import { BAR_WIDTH, NON_TTY_INTERVAL_MS } from './constants';

const FILLED = '█';
const EMPTY = '░';

function progressBar(pct: number): string {
  const filled = Math.round(Math.min(pct, 1) * BAR_WIDTH);
  return FILLED.repeat(filled) + EMPTY.repeat(BAR_WIDTH - filled);
}

function formatSpeed(filesPerSec: number): string {
  if (filesPerSec >= 1000) return `${(filesPerSec / 1000).toFixed(1)}k/s`;
  return `${filesPerSec.toFixed(0)}/s`;
}

function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${(s % 60).toFixed(0)}s`;
}

function formatEta(remainingFiles: number, rate: number): string {
  if (rate <= 0) return '';
  const secs = remainingFiles / rate;
  if (secs < 1) return '';
  if (secs < 60) return `  eta ${secs.toFixed(0)}s`;
  return `  eta ${(secs / 60).toFixed(1)}m`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').at(-1) ?? path;
}

/**
 * Render a multi-line progress display.
 * Line 0: overall bar — `  [████░░░░]  50%  100/200 @ 42/s  eta 2s`
 * Lines 1-N: one per active file — `  ├─ fastutil.jar        [████░░░░]  42%  12.1/28.4 MB`
 */
export function renderProgress(
  fetched: number,
  total: number,
  t0: number,
  activeFiles: ReadonlyArray<{
    name: string;
    bytes: number;
    total: number;
  }> = [],
): string[] {
  const pct = total === 0 ? 1 : fetched / total;
  const elapsedMs = Math.max(Date.now() - t0, 1);
  const rate = fetched / (elapsedMs / 1000);
  const bar = progressBar(pct);
  const pctStr = `${Math.round(pct * 100)
    .toString()
    .padStart(3)}%`;
  const countStr = `${fetched}/${total}`;
  const speedStr = rate > 0.1 ? ` @ ${formatSpeed(rate)}` : '';
  const etaStr = fetched < total ? formatEta(total - fetched, rate) : '';
  const overallLine = `  [${bar}] ${pctStr}  ${countStr}${speedStr}${etaStr}`;

  const columns = process.stderr.columns ?? 80;
  const fileLines = activeFiles.map((f, i) => {
    const isLast = i === activeFiles.length - 1;
    const indent = isLast ? '  └─ ' : '  ├─ ';
    const name = basename(f.name);
    const pctF = f.total > 0 ? f.bytes / f.total : 0;
    const barF = progressBar(pctF);
    const pctFStr = `${Math.round(pctF * 100)
      .toString()
      .padStart(3)}%`;
    // Pad the bytes side to the same width as the total so the bar doesn't shift
    // as bytes progress from "0 B" (3 chars) toward "35 KB" (5 chars).
    const totalFmt = f.total > 0 ? formatBytes(f.total) : '';
    const byteStr =
      f.total > 0
        ? `  ${formatBytes(f.bytes).padStart(totalFmt.length)}/${totalFmt}`
        : f.bytes > 0
          ? `  ${formatBytes(f.bytes)}`
          : '';
    const fixedSuffix = `  [${barF}] ${pctFStr}${byteStr}`;
    const nameBudget = columns - 1 - indent.length - fixedSuffix.length;
    const namePart =
      nameBudget > 4 ? name.slice(0, nameBudget).padEnd(nameBudget) : '';
    return `${indent}${namePart}${fixedSuffix}`;
  });

  return [overallLine, ...fileLines];
}

/**
 * A multi-line progress writer.
 * On TTY: uses ANSI escape sequences to overwrite the previous block in-place.
 * On non-TTY: emits only the first (overall) line, throttled to every `nonTtyInterval` ms.
 */
export class ProgressWriter {
  private lastLines: string[] = [];
  private lastNonTtyWrite = 0;

  constructor(
    private readonly isTTY: boolean,
    private readonly nonTtyInterval = NON_TTY_INTERVAL_MS,
  ) {}

  private _clearLines(): void {
    if (!this.isTTY || this.lastLines.length === 0) return;
    // Erase current (bottom) line, then move up and erase each line above it.
    process.stderr.write('\x1b[2K\r');
    for (let i = 1; i < this.lastLines.length; i++) {
      process.stderr.write('\x1b[1A\x1b[2K\r');
    }
  }

  update(lines: string[]): void {
    if (this.isTTY) {
      this._clearLines();
      process.stderr.write(lines.join('\n'));
      this.lastLines = lines;
    } else {
      const now = Date.now();
      if (now - this.lastNonTtyWrite >= this.nonTtyInterval) {
        if (lines.length > 0) process.stderr.write(`${lines[0]}\n`);
        this.lastNonTtyWrite = now;
      }
    }
  }

  /** Clear the current progress block (TTY only). */
  clear(): void {
    if (this.isTTY && this.lastLines.length > 0) {
      this._clearLines();
      this.lastLines = [];
    }
  }

  /** Redraw the last progress block after an interleaved log write (TTY only). */
  redraw(): void {
    if (this.isTTY && this.lastLines.length > 0) {
      process.stderr.write(this.lastLines.join('\n'));
    }
  }

  /** Finalize the progress block with a trailing newline. */
  finish(lines?: string[]): void {
    if (this.isTTY) {
      this._clearLines();
      const out = lines ?? this.lastLines;
      if (out.length > 0) process.stderr.write(`${out.join('\n')}\n`);
      this.lastLines = [];
    } else if (lines && lines.length > 0) {
      process.stderr.write(`${lines[0]}\n`);
    }
  }

  /** Write a full log line, clearing any in-progress block first. */
  log(line: string): void {
    this.clear();
    process.stderr.write(`${line}\n`);
  }

  /** Elapsed ms since a given start time, formatted. */
  static elapsed(t0: number): string {
    return formatDuration(Date.now() - t0);
  }
}
