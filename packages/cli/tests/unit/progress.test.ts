import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  basename,
  elapsed,
  initialProgress,
  renderProgress,
  ProgressWriter,
  type ProgressState,
} from '../../lib/progress';

afterEach(() => vi.restoreAllMocks());

function captureStderr(): string[] {
  const lines: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
  return lines;
}

describe('basename', () => {
  it('returns the last segment of a posix path', () => {
    expect(basename('mods/jei.jar')).toBe('jei.jar');
  });

  it('handles windows-style separators', () => {
    expect(basename('C:\\game\\mods\\jei.jar')).toBe('jei.jar');
  });

  it('returns the input unchanged when there is no separator', () => {
    expect(basename('jei.jar')).toBe('jei.jar');
  });

  it('handles a trailing slash by yielding an empty segment', () => {
    expect(basename('mods/')).toBe('');
  });
});

describe('elapsed', () => {
  it('formats sub-minute durations in seconds', () => {
    vi.spyOn(Date, 'now').mockReturnValue(5_000);
    expect(elapsed(0)).toBe('5.0s');
  });

  it('formats durations over a minute as minutes and seconds', () => {
    vi.spyOn(Date, 'now').mockReturnValue(90_000);
    expect(elapsed(0)).toBe('1m 30s');
  });
});

describe('initialProgress', () => {
  it('builds a zeroed progress state', () => {
    const state = initialProgress(10, 123);
    expect(state).toEqual({ fetched: 0, total: 10, t0: 123, active: [] });
  });
});

describe('renderProgress', () => {
  it('renders 100% for an empty total', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const lines = renderProgress(initialProgress(0, 0));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('100%');
    expect(lines[0]).toContain('0/0');
    expect(lines[0]).toContain('█'.repeat(24));
  });

  it('renders a partial bar with a percentage and count', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const state: ProgressState = {
      fetched: 5,
      total: 10,
      t0: 0,
      active: [],
    };
    const line = renderProgress(state)[0]!;
    expect(line).toContain(' 50%');
    expect(line).toContain('5/10');
    expect(line).toContain('█'.repeat(12) + '░'.repeat(12));
  });

  it('includes a speed readout when the rate is meaningful', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    const state: ProgressState = { fetched: 4, total: 10, t0: 0, active: [] };
    expect(renderProgress(state)[0]).toMatch(/@ \d/);
  });

  it('formats a high rate in thousands per second', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1);
    const state: ProgressState = {
      fetched: 5_000,
      total: 10_000,
      t0: 0,
      active: [],
    };
    expect(renderProgress(state)[0]).toMatch(/k\/s/);
  });

  it('shows an eta in seconds while files remain', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const state: ProgressState = { fetched: 2, total: 10, t0: 0, active: [] };
    expect(renderProgress(state)[0]).toMatch(/eta \d+s/);
  });

  it('shows an eta in minutes for long-running downloads', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const state: ProgressState = {
      fetched: 1,
      total: 1_000,
      t0: 0,
      active: [],
    };
    expect(renderProgress(state)[0]).toMatch(/eta \d+\.\d+m/);
  });

  it('omits the eta once fetched reaches total', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const state: ProgressState = { fetched: 10, total: 10, t0: 0, active: [] };
    expect(renderProgress(state)[0]).not.toContain('eta');
  });

  it('renders an active file line with byte counts', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const state: ProgressState = {
      fetched: 0,
      total: 1,
      t0: 0,
      active: [{ name: 'mods/jei.jar', bytes: 512 * 1024, total: 1024 * 1024 }],
    };
    const lines = renderProgress(state);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(' └─ ');
    expect(lines[1]).toContain('jei.jar');
    expect(lines[1]).toContain('1.0 MB');
    expect(lines[1]).toContain(' 50%');
  });

  it('uses a tee connector for non-final active files', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const state: ProgressState = {
      fetched: 0,
      total: 2,
      t0: 0,
      active: [
        { name: 'a.jar', bytes: 0, total: 0 },
        { name: 'b.jar', bytes: 0, total: 0 },
      ],
    };
    const lines = renderProgress(state);
    expect(lines[1]).toContain(' ├─ ');
    expect(lines[2]).toContain(' └─ ');
  });

  it('renders a file with bytes but no known total', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const state: ProgressState = {
      fetched: 0,
      total: 1,
      t0: 0,
      active: [{ name: 'a.jar', bytes: 2048, total: 0 }],
    };
    expect(renderProgress(state)[1]).toContain('2 KB');
  });

  it('formats kilobyte-scale totals', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const state: ProgressState = {
      fetched: 0,
      total: 1,
      t0: 0,
      active: [{ name: 'a.jar', bytes: 0, total: 4096 }],
    };
    expect(renderProgress(state)[1]).toContain('4 KB');
  });

  it('formats byte-scale totals', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const state: ProgressState = {
      fetched: 0,
      total: 1,
      t0: 0,
      active: [{ name: 'a.jar', bytes: 0, total: 100 }],
    };
    expect(renderProgress(state)[1]).toContain('100 B');
  });

  it('drops the file name when the terminal is too narrow', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const original = process.stderr.columns;
    Object.defineProperty(process.stderr, 'columns', {
      value: 20,
      configurable: true,
    });
    try {
      const state: ProgressState = {
        fetched: 0,
        total: 1,
        t0: 0,
        active: [{ name: 'very-long-file-name.jar', bytes: 0, total: 0 }],
      };
      const line = renderProgress(state)[1]!;
      expect(line).not.toContain('very-long');
    } finally {
      Object.defineProperty(process.stderr, 'columns', {
        value: original,
        configurable: true,
      });
    }
  });
});

describe('ProgressWriter (TTY)', () => {
  it('writes the joined lines on update', () => {
    const lines = captureStderr();
    const pw = new ProgressWriter(true);
    pw.update(['line one']);
    expect(lines.join('')).toContain('line one');
  });

  it('clears prior lines before drawing the next update', () => {
    const lines = captureStderr();
    const pw = new ProgressWriter(true);
    pw.update(['first', 'second']);
    lines.length = 0;
    pw.update(['third']);
    // one \x1b[2K\r for the first line plus one \x1b[1A\x1b[2K\r per extra line
    expect(lines.join('')).toContain('\x1b[2K\r');
    expect(lines.join('')).toContain('\x1b[1A\x1b[2K\r');
    expect(lines.join('')).toContain('third');
  });

  it('clear() erases the in-flight bar', () => {
    const lines = captureStderr();
    const pw = new ProgressWriter(true);
    pw.update(['bar']);
    lines.length = 0;
    pw.clear();
    expect(lines.join('')).toContain('\x1b[2K\r');
  });

  it('clear() is a no-op when nothing was drawn', () => {
    const lines = captureStderr();
    new ProgressWriter(true).clear();
    expect(lines).toEqual([]);
  });

  it('redraw() reprints the last lines', () => {
    const lines = captureStderr();
    const pw = new ProgressWriter(true);
    pw.update(['kept']);
    lines.length = 0;
    pw.redraw();
    expect(lines.join('')).toContain('kept');
  });

  it('redraw() is a no-op when nothing was drawn', () => {
    const lines = captureStderr();
    new ProgressWriter(true).redraw();
    expect(lines).toEqual([]);
  });

  it('log() clears the bar then writes the line', () => {
    const lines = captureStderr();
    const pw = new ProgressWriter(true);
    pw.update(['bar']);
    lines.length = 0;
    pw.log('a message');
    expect(lines.join('')).toContain('a message\n');
  });

  it('finish() prints the last lines and resets state', () => {
    const lines = captureStderr();
    const pw = new ProgressWriter(true);
    pw.update(['done']);
    lines.length = 0;
    pw.finish();
    expect(lines.join('')).toContain('done\n');
    // a subsequent finish has nothing left to print
    lines.length = 0;
    pw.finish();
    expect(lines).toEqual([]);
  });

  it('finish() accepts explicit final lines', () => {
    const lines = captureStderr();
    const pw = new ProgressWriter(true);
    pw.update(['old']);
    lines.length = 0;
    pw.finish(['final']);
    expect(lines.join('')).toContain('final\n');
  });
});

describe('ProgressWriter (non-TTY)', () => {
  it('writes the first line on the first update', () => {
    const lines = captureStderr();
    const pw = new ProgressWriter(false, 1_000);
    pw.update(['overall', 'detail']);
    expect(lines).toEqual(['overall\n']);
  });

  it('throttles updates within the interval', () => {
    const lines = captureStderr();
    const pw = new ProgressWriter(false, 10_000);
    pw.update(['first']);
    pw.update(['second']);
    expect(lines).toEqual(['first\n']);
  });

  it('emits again after the interval elapses', () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);
    const lines = captureStderr();
    const pw = new ProgressWriter(false, 1_000);
    pw.update(['first']);
    nowSpy.mockReturnValue(5_000);
    pw.update(['second']);
    expect(lines).toEqual(['first\n', 'second\n']);
  });

  it('skips empty update line arrays', () => {
    const lines = captureStderr();
    const pw = new ProgressWriter(false, 1_000);
    pw.update([]);
    expect(lines).toEqual([]);
  });

  it('clear() and redraw() are no-ops without a TTY', () => {
    const lines = captureStderr();
    const pw = new ProgressWriter(false, 1_000);
    pw.update(['x']);
    lines.length = 0;
    pw.clear();
    pw.redraw();
    expect(lines).toEqual([]);
  });

  it('log() still writes the line without a TTY', () => {
    const lines = captureStderr();
    new ProgressWriter(false, 1_000).log('note');
    expect(lines).toEqual(['note\n']);
  });

  it('finish() prints the first explicit line without a TTY', () => {
    const lines = captureStderr();
    new ProgressWriter(false, 1_000).finish(['summary', 'extra']);
    expect(lines).toEqual(['summary\n']);
  });

  it('finish() without lines writes nothing when non-TTY', () => {
    const lines = captureStderr();
    new ProgressWriter(false, 1_000).finish();
    expect(lines).toEqual([]);
  });
});
