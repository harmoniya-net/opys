import { describe, expect, it } from 'vitest';
import { interpolate, resolveVars } from '../../lib/interpolate';

describe('resolveVars', () => {
  it('resolves simple reference', () => {
    expect(resolveVars({ a: 'hello', b: '${a} world' })).toMatchObject({
      a: 'hello',
      b: 'hello world',
    });
  });

  it('throws on self-reference (circular)', () => {
    expect(() => resolveVars({ x: '${x}' })).toThrow('Circular');
  });

  it('throws on circular dependency', () => {
    expect(() => resolveVars({ a: '${b}', b: '${a}' })).toThrow('Circular');
  });

  it('throws on longer circular chain', () => {
    expect(() => resolveVars({ a: '${b}', b: '${c}', c: '${a}' })).toThrow(
      'Circular',
    );
  });

  it('leaves unknown variable as-is', () => {
    const result = resolveVars({ a: 'hello ${unknown}' });
    expect(result.a).toBe('hello ${unknown}');
  });

  it('empty var map with placeholder returns placeholder unchanged', () => {
    expect(interpolate('${x}', {})).toBe('${x}');
  });

  it('escaped \\${ becomes literal ${', () => {
    expect(interpolate('\\${not_a_var}', { not_a_var: 'replaced' })).toBe(
      '${not_a_var}',
    );
  });

  it('placeholder with spaces is left as-is', () => {
    expect(interpolate('${ spaced }', { ' spaced ': 'x' })).toBe('${ spaced }');
  });

  it('multiple references to same missing var are all left as-is', () => {
    expect(interpolate('${x} and ${x}', {})).toBe('${x} and ${x}');
  });

  it('chains of three vars resolve correctly', () => {
    const result = resolveVars({ a: 'foo', b: '${a}/bar', c: '${b}/baz' });
    expect(result.c).toBe('foo/bar/baz');
  });

  it('unescapes \\${ within a resolved var template', () => {
    expect(resolveVars({ a: '\\${literal}' }).a).toBe('${literal}');
  });

  it('leaves a spaced placeholder inside a var template untouched', () => {
    expect(resolveVars({ a: '${ spaced }' }).a).toBe('${ spaced }');
  });

  it('preserves the placeholder when a var value is nullish', () => {
    expect(interpolate('${x}', { x: undefined as unknown as string })).toBe(
      '${x}',
    );
  });
});
