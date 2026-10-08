import { describe, expect, test } from 'vitest';
import {
  ExtractionError,
  IntegrityError,
  NetworkError,
  RuntimeError,
  translateError,
} from '../../lib';

/** What the binding throws: an Error whose message is the crate's report. */
const thrown = (report: object) => new Error(JSON.stringify(report));

describe('translateError', () => {
  test('non-Error inputs pass through untouched', () => {
    expect(translateError('plain string')).toBe('plain string');
    expect(translateError(42)).toBe(42);
    expect(translateError(null)).toBe(null);
  });

  test('a network report becomes a NetworkError', () => {
    const out = translateError(
      thrown({
        code: 'network',
        message: 'HTTP 404 downloading https://example.test/x.jar — gone',
        url: 'https://example.test/x.jar',
        status: 404,
        body: 'gone',
      }),
    );
    expect(out).toBeInstanceOf(NetworkError);
    expect(out).toBeInstanceOf(RuntimeError);
    const n = out as NetworkError;
    expect(n.code).toBe('network');
    expect(n.status).toBe(404);
    expect(n.url).toBe('https://example.test/x.jar');
    expect(n.body).toBe('gone');
    expect(n.message).toBe(
      'HTTP 404 downloading https://example.test/x.jar — gone',
    );
  });

  // The message joins paths with ", ". Reading them back out of it split a
  // file name that had a comma of its own.
  test('an integrity report keeps each path whole', () => {
    const out = translateError(
      thrown({
        code: 'integrity',
        message: 'Integrity check failed: mods/a, b.jar, mods/c.jar',
        paths: ['mods/a, b.jar', 'mods/c.jar'],
      }),
    );
    expect(out).toBeInstanceOf(IntegrityError);
    expect((out as IntegrityError).paths).toEqual([
      'mods/a, b.jar',
      'mods/c.jar',
    ]);
    expect((out as IntegrityError).code).toBe('integrity');
  });

  test('an extraction report carries the path and the cause', () => {
    const out = translateError(
      thrown({
        code: 'extraction',
        message: 'Failed to extract mods/foo bar.jar: bad header',
        artifactPath: 'mods/foo bar.jar',
        cause: 'bad header',
      }),
    );
    expect(out).toBeInstanceOf(ExtractionError);
    const e = out as ExtractionError;
    expect(e.code).toBe('extraction');
    expect(e.artifactPath).toBe('mods/foo bar.jar');
    expect((e.cause as Error).message).toBe('bad header');
  });

  test.each(['manifest', 'io', 'cancelled', 'other'] as const)(
    'a %s report becomes a RuntimeError with that code',
    (code) => {
      const out = translateError(thrown({ code, message: 'what happened' }));
      expect(out).toBeInstanceOf(RuntimeError);
      expect((out as RuntimeError).code).toBe(code);
      expect((out as RuntimeError).message).toBe('what happened');
    },
  );

  test('an error that is not a report comes back as it was', () => {
    for (const err of [
      new Error('something else entirely'),
      new Error('{ not json'),
      new Error('{"message":"no code"}'),
      // The wording the classes used to be recognised by.
      new Error('HTTP 404 downloading https://example.test/x.jar'),
    ]) {
      expect(translateError(err)).toBe(err);
    }
  });
});
