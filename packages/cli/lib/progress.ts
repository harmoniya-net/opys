const BAR_WIDTH = 24;
const NON_TTY_INTERVAL_MS = 3_000;

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

function formatEta(remaining: number, rate: number): string {
  if (rate <= 0) return '';
  const secs = remaining / rate;
  if (secs < 1) return '';
  if (secs < 60) return ` eta ${secs.toFixed(0)}s`;
  return ` eta ${(secs / 60).toFixed(1)}m`;
}

export function elapsed(t0: number): string {
  return formatDuration(Date.now() - t0);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${Math.round(bytes)} B`;
}

export function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').at(-1) ?? path;
}

export interface ProgressState {
  fetched: number;
  total: number;
  /** Bytes of the files that have finished. */
  bytes: number;
  /** Bytes of every file the manifest gives a size; 0 when it gives none. */
  totalBytes: number;
  t0: number;
  active: ReadonlyArray<{ name: string; bytes: number; total: number }>;
}

export function initialProgress(total: number, t0: number): ProgressState {
  return { fetched: 0, total, bytes: 0, totalBytes: 0, t0, active: [] };
}

/**
 * How far along, how fast, and how long is left.
 *
 * Measured in bytes wherever the manifest gives sizes. Counting files said
 * "0% — eta 60 hours" for the first quarter-hour of an installation, because
 * the largest files go first: one JDK archive is a third of the bytes and one
 * four-thousandth of the files.
 */
function overallProgress(state: ProgressState): {
  pct: number;
  speed: string;
  eta: string;
} {
  const { fetched, total, bytes, totalBytes, t0, active } = state;
  const seconds = Math.max(Date.now() - t0, 1) / 1000;
  if (totalBytes > 0) {
    const inFlight = active.reduce((sum, f) => sum + f.bytes, 0);
    const done = Math.min(bytes + inFlight, totalBytes);
    const rate = done / seconds;
    return {
      pct: done / totalBytes,
      speed: rate > 0 ? ` @ ${formatBytes(rate)}/s` : '',
      eta: fetched < total ? formatEta(totalBytes - done, rate) : '',
    };
  }
  const rate = fetched / seconds;
  return {
    pct: total === 0 ? 1 : fetched / total,
    speed: rate > 0.1 ? ` @ ${formatSpeed(rate)}` : '',
    eta: fetched < total ? formatEta(total - fetched, rate) : '',
  };
}

export function renderProgress(state: ProgressState): string[] {
  const { fetched, total, active } = state;
  const { pct, speed, eta } = overallProgress(state);
  const bar = progressBar(pct);
  const pctStr = `${Math.round(pct * 100)
    .toString()
    .padStart(3)}%`;
  const overall = ` [${bar}] ${pctStr} ${fetched}/${total}${speed}${eta}`;

  const cols = process.stderr.columns ?? 80;
  const fileLines = active.map((f, i) => {
    const isLast = i === active.length - 1;
    const indent = isLast ? ' └─ ' : ' ├─ ';
    const name = basename(f.name);
    const pctF = f.total > 0 ? f.bytes / f.total : 0;
    const barF = progressBar(pctF);
    const pctFStr = `${Math.round(pctF * 100)
      .toString()
      .padStart(3)}%`;
    const totalFmt = f.total > 0 ? formatBytes(f.total) : '';
    const byteStr =
      f.total > 0
        ? ` ${formatBytes(f.bytes).padStart(totalFmt.length)}/${totalFmt}`
        : f.bytes > 0
          ? ` ${formatBytes(f.bytes)}`
          : '';
    const fixed = ` [${barF}] ${pctFStr}${byteStr}`;
    const nameBudget = cols - 1 - indent.length - fixed.length;
    const namePart =
      nameBudget > 4 ? name.slice(0, nameBudget).padEnd(nameBudget) : '';
    return `${indent}${namePart}${fixed}`;
  });

  return [overall, ...fileLines];
}

export class ProgressWriter {
  private lastLines: string[] = [];
  private lastNonTty = 0;
  constructor(
    private readonly isTTY: boolean,
    private readonly nonTtyInterval = NON_TTY_INTERVAL_MS,
  ) {}

  private clearLines(): void {
    if (!this.isTTY || this.lastLines.length === 0) return;
    process.stderr.write('\x1b[2K\r');
    for (let i = 1; i < this.lastLines.length; i++) {
      process.stderr.write('\x1b[1A\x1b[2K\r');
    }
  }

  update(lines: string[]): void {
    if (this.isTTY) {
      this.clearLines();
      process.stderr.write(lines.join('\n'));
      this.lastLines = lines;
    } else {
      const now = Date.now();
      if (now - this.lastNonTty >= this.nonTtyInterval) {
        if (lines.length > 0) process.stderr.write(`${lines[0]}\n`);
        this.lastNonTty = now;
      }
    }
  }

  clear(): void {
    if (this.isTTY && this.lastLines.length > 0) {
      this.clearLines();
      this.lastLines = [];
    }
  }

  redraw(): void {
    if (this.isTTY && this.lastLines.length > 0) {
      process.stderr.write(this.lastLines.join('\n'));
    }
  }

  log(line: string): void {
    this.clear();
    process.stderr.write(`${line}\n`);
  }

  finish(lines?: string[]): void {
    if (this.isTTY) {
      this.clearLines();
      const out = lines ?? this.lastLines;
      if (out.length > 0) process.stderr.write(`${out.join('\n')}\n`);
      this.lastLines = [];
    } else if (lines && lines.length > 0) {
      process.stderr.write(`${lines[0]}\n`);
    }
  }
}
