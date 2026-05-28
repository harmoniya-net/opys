import { describe, expect, test } from 'vitest';
import {
  ExtractionError,
  IntegrityError,
  NetworkError,
  translateError,
} from '../../lib';

describe('translateError', () => {
  test('non-Error inputs pass through untouched', () => {
    expect(translateError('plain string')).toBe('plain string');
    expect(translateError(42)).toBe(42);
    expect(translateError(null)).toBe(null);
  });

  test('"HTTP N downloading URL" → NetworkError', () => {
    const err = new Error('HTTP 404 downloading https://example.test/x.jar');
    const out = translateError(err);
    expect(out).toBeInstanceOf(NetworkError);
    const n = out as NetworkError;
    expect(n.status).toBe(404);
    expect(n.url).toBe('https://example.test/x.jar');
    expect(n.message).toBe('HTTP 404 downloading https://example.test/x.jar');
    expect(n.kind).toBe('network');
  });

  test('"Integrity check failed: …" → IntegrityError with split paths', () => {
    const err = new Error('Integrity check failed: a.jar, b.jar, c.jar');
    const out = translateError(err);
    expect(out).toBeInstanceOf(IntegrityError);
    expect((out as IntegrityError).paths).toEqual(['a.jar', 'b.jar', 'c.jar']);
    expect((out as IntegrityError).kind).toBe('integrity');
  });

  test('"Integrity check failed: single" → IntegrityError with one path', () => {
    const out = translateError(new Error('Integrity check failed: only.jar'));
    expect((out as IntegrityError).paths).toEqual(['only.jar']);
  });

  test('"Failed to extract …" → ExtractionError preserving cause', () => {
    const root = new Error('Failed to extract mods/foo.jar: bad header');
    const out = translateError(root);
    expect(out).toBeInstanceOf(ExtractionError);
    const e = out as ExtractionError;
    expect(e.artifactPath).toBe('mods/foo.jar');
    expect(e.kind).toBe('extraction');
    expect(e.cause).toBe(root);
  });

  test('unrecognized Error messages pass through unchanged', () => {
    const err = new Error('something else entirely');
    expect(translateError(err)).toBe(err);
  });
});
