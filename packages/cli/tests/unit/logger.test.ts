import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger, parseLogLevel } from '../../lib/logger';
import { ProgressWriter } from '../../lib/progress';

afterEach(() => vi.restoreAllMocks());

function captureStderr(): string[] {
  const lines: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
  return lines;
}

describe('Logger.enables', () => {
  it('enables levels at or below the threshold', () => {
    const logger = new Logger('info');
    expect(logger.enables('error')).toBe(true);
    expect(logger.enables('warn')).toBe(true);
    expect(logger.enables('info')).toBe(true);
    expect(logger.enables('debug')).toBe(false);
  });

  it('a silent logger enables nothing', () => {
    const logger = new Logger('silent');
    expect(logger.enables('error')).toBe(false);
    expect(logger.enables('silent')).toBe(true);
  });

  it('a debug logger enables every level', () => {
    const logger = new Logger('debug');
    for (const lvl of ['error', 'warn', 'info', 'debug'] as const) {
      expect(logger.enables(lvl)).toBe(true);
    }
  });
});

describe('Logger emit', () => {
  it('writes info lines with no prefix', () => {
    const lines = captureStderr();
    new Logger('info').info('hello');
    expect(lines).toEqual(['hello\n']);
  });

  it('prefixes error lines with [error] and an elapsed marker', () => {
    const lines = captureStderr();
    new Logger('error').error('broke');
    expect(lines[0]).toMatch(/^\[error\] \+\d+ms broke\n$/);
  });

  it('prefixes warn lines with [warn]', () => {
    const lines = captureStderr();
    new Logger('warn').warn('careful');
    expect(lines[0]).toMatch(/^\[warn\] {2}\+\d+ms careful\n$/);
  });

  it('prefixes debug lines with [debug]', () => {
    const lines = captureStderr();
    new Logger('debug').debug('trace');
    expect(lines[0]).toMatch(/^\[debug\] \+\d+ms trace\n$/);
  });

  it('suppresses lines below the threshold', () => {
    const lines = captureStderr();
    new Logger('warn').info('quiet');
    expect(lines).toEqual([]);
  });

  it('a silent logger writes nothing', () => {
    const lines = captureStderr();
    const logger = new Logger('silent');
    logger.error('x');
    logger.warn('x');
    logger.info('x');
    logger.debug('x');
    expect(lines).toEqual([]);
  });
});

describe('Logger.installerLog', () => {
  it('returns a callback that emits debug and warn lines', () => {
    const lines = captureStderr();
    const log = new Logger('debug').installerLog();
    log('debug', 'd-msg');
    log('warn', 'w-msg');
    expect(lines[0]).toMatch(/\[debug\].*d-msg/);
    expect(lines[1]).toMatch(/\[warn\].*w-msg/);
  });

  it('respects the level threshold', () => {
    const lines = captureStderr();
    const log = new Logger('info').installerLog();
    log('debug', 'd-msg');
    expect(lines).toEqual([]);
  });
});

describe('Logger + ProgressWriter coordination', () => {
  it('clears and redraws the progress writer around a log line', () => {
    captureStderr();
    const pw = new ProgressWriter(false);
    const clear = vi.spyOn(pw, 'clear');
    const redraw = vi.spyOn(pw, 'redraw');
    const logger = new Logger('info');
    logger.setProgressWriter(pw);
    logger.info('with-bar');
    expect(clear).toHaveBeenCalledOnce();
    expect(redraw).toHaveBeenCalledOnce();
  });

  it('does not touch the progress writer for suppressed lines', () => {
    captureStderr();
    const pw = new ProgressWriter(false);
    const clear = vi.spyOn(pw, 'clear');
    const logger = new Logger('error');
    logger.setProgressWriter(pw);
    logger.info('suppressed');
    expect(clear).not.toHaveBeenCalled();
  });
});

describe('parseLogLevel', () => {
  it('defaults to info when given undefined', () => {
    expect(parseLogLevel(undefined)).toBe('info');
  });

  it('defaults to info when given an empty string', () => {
    expect(parseLogLevel('')).toBe('info');
  });

  it('accepts every known level', () => {
    for (const lvl of ['silent', 'error', 'warn', 'info', 'debug'] as const) {
      expect(parseLogLevel(lvl)).toBe(lvl);
    }
  });

  it('warns and defaults to info on an unknown level', () => {
    const lines = captureStderr();
    expect(parseLogLevel('loud')).toBe('info');
    expect(lines[0]).toMatch(/Unknown log level 'loud'/);
  });
});
