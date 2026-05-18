import { describe, expect, it } from 'vitest';
import { UsageError } from '../../lib/errors';

describe('UsageError', () => {
  it('is an Error subclass', () => {
    const err = new UsageError('bad flag');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UsageError);
  });

  it('carries the message', () => {
    expect(new UsageError('boom').message).toBe('boom');
  });

  it('sets the name to UsageError', () => {
    expect(new UsageError('x').name).toBe('UsageError');
  });
});
