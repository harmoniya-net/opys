import { describe, expect, it } from 'vitest';
import {
  NetworkError,
  IntegrityError,
  ExtractionError,
} from '../../lib/errors';

describe('NetworkError', () => {
  it('carries url, status and a body-aware message', () => {
    const err = new NetworkError('https://x/a.jar', 503, 'upstream down');
    expect(err.kind).toBe('network');
    expect(err.name).toBe('NetworkError');
    expect(err.url).toBe('https://x/a.jar');
    expect(err.status).toBe(503);
    expect(err.message).toBe(
      'HTTP 503 downloading https://x/a.jar — upstream down',
    );
    expect(err).toBeInstanceOf(Error);
  });

  it('omits the body segment when the body is empty', () => {
    expect(new NetworkError('https://x', 404, '').message).toBe(
      'HTTP 404 downloading https://x',
    );
  });
});

describe('IntegrityError', () => {
  it('lists the failed paths in the message', () => {
    const err = new IntegrityError(['a.jar', 'b.jar']);
    expect(err.kind).toBe('integrity');
    expect(err.name).toBe('IntegrityError');
    expect(err.paths).toEqual(['a.jar', 'b.jar']);
    expect(err.message).toBe('Integrity check failed: a.jar, b.jar');
  });
});

describe('ExtractionError', () => {
  it('names the artifact and preserves the cause', () => {
    const cause = new Error('bad zip');
    const err = new ExtractionError('mods/pack.zip', { cause });
    expect(err.kind).toBe('extraction');
    expect(err.name).toBe('ExtractionError');
    expect(err.artifactPath).toBe('mods/pack.zip');
    expect(err.message).toBe('Failed to extract mods/pack.zip');
    expect(err.cause).toBe(cause);
  });

  it('works without error options', () => {
    expect(new ExtractionError('a').cause).toBeUndefined();
  });
});
