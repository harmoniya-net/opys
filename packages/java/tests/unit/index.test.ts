import { describe, expect, it } from 'vitest';
import * as api from '../../lib/index';
import { DEFAULT_PLATFORMS } from '../../lib/platforms';

describe('@opys/java public API', () => {
  it('re-exports the java plugin factory', () => {
    expect(typeof api.java).toBe('function');
  });

  it('re-exports resolveJava', () => {
    expect(typeof api.resolveJava).toBe('function');
  });

  it('re-exports one resolver per vendor', () => {
    expect(typeof api.resolveTemurin).toBe('function');
    expect(typeof api.resolveZulu).toBe('function');
    expect(typeof api.resolveGraalvm).toBe('function');
  });

  it('re-exports DEFAULT_PLATFORMS unchanged from platforms.ts', () => {
    expect(api.DEFAULT_PLATFORMS).toBe(DEFAULT_PLATFORMS);
    expect(api.DEFAULT_PLATFORMS).toHaveLength(6);
  });
});
