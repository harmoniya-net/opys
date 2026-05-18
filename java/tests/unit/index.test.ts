import { describe, expect, it } from 'vitest';
import * as api from '../../lib/index';
import { DEFAULT_PLATFORMS } from '../../lib/resolver';

describe('@torba/java public API', () => {
  it('re-exports the java plugin factory', () => {
    expect(typeof api.java).toBe('function');
  });

  it('re-exports resolveJava', () => {
    expect(typeof api.resolveJava).toBe('function');
  });

  it('re-exports resolveOpenjdk', () => {
    expect(typeof api.resolveOpenjdk).toBe('function');
  });

  it('re-exports DEFAULT_PLATFORMS unchanged from the resolver', () => {
    expect(api.DEFAULT_PLATFORMS).toBe(DEFAULT_PLATFORMS);
    expect(api.DEFAULT_PLATFORMS).toHaveLength(6);
  });
});
