import { describe, expect, it } from 'vitest';
import { globToRegex, globBase } from '../../lib/glob';

const matches = (glob: string, path: string): boolean =>
  globToRegex(glob).test(path);

describe('globToRegex', () => {
  it('literal path matches itself only', () => {
    expect(matches('mods/foo.jar', 'mods/foo.jar')).toBe(true);
    expect(matches('mods/foo.jar', 'mods/bar.jar')).toBe(false);
  });

  it('* matches a single segment', () => {
    expect(matches('mods/*.jar', 'mods/foo.jar')).toBe(true);
    expect(matches('mods/*.jar', 'mods/sub/foo.jar')).toBe(false);
    expect(matches('mods/*.jar', 'mods/foo.txt')).toBe(false);
  });

  it('** middle matches zero or more segments', () => {
    expect(matches('mods/**/*.jar', 'mods/foo.jar')).toBe(true);
    expect(matches('mods/**/*.jar', 'mods/sub/foo.jar')).toBe(true);
    expect(matches('mods/**/*.jar', 'mods/a/b/c/foo.jar')).toBe(true);
    expect(matches('mods/**/*.jar', 'mods/foo.txt')).toBe(false);
  });

  it('** prefix matches anywhere', () => {
    expect(matches('**/*.jar', 'foo.jar')).toBe(true);
    expect(matches('**/*.jar', 'a/foo.jar')).toBe(true);
    expect(matches('**/*.jar', 'a/b/foo.jar')).toBe(true);
  });

  it('** suffix matches subtree', () => {
    expect(matches('mods/**', 'mods')).toBe(true);
    expect(matches('mods/**', 'mods/foo')).toBe(true);
    expect(matches('mods/**', 'mods/a/b/c')).toBe(true);
    expect(matches('mods/**', 'other/foo')).toBe(false);
  });

  it('? matches one non-separator char', () => {
    expect(matches('a?.jar', 'ab.jar')).toBe(true);
    expect(matches('a?.jar', 'abc.jar')).toBe(false);
    expect(matches('a?.jar', 'a/.jar')).toBe(false);
  });

  it('{a,b} alternation', () => {
    expect(matches('mods/*.{jar,zip}', 'mods/foo.jar')).toBe(true);
    expect(matches('mods/*.{jar,zip}', 'mods/foo.zip')).toBe(true);
    expect(matches('mods/*.{jar,zip}', 'mods/foo.txt')).toBe(false);
  });

  it('escapes regex metacharacters in literal segments', () => {
    expect(matches('mods/a.jar', 'modsXjar')).toBe(false); // `.` is literal
    expect(matches('mods/a+b.jar', 'mods/a+b.jar')).toBe(true);
    expect(matches('mods/(x).jar', 'mods/(x).jar')).toBe(true);
  });

  it('bare ** matches across separators', () => {
    expect(matches('a**b', 'ab')).toBe(true);
    expect(matches('a**b', 'a/x/y/b')).toBe(true);
    expect(matches('a**b', 'a/x/yb')).toBe(true);
  });

  it('treats an unclosed brace as a literal {', () => {
    expect(matches('mods/{ab', 'mods/{ab')).toBe(true);
    expect(matches('mods/{ab', 'mods/ab')).toBe(false);
  });
});

describe('globBase', () => {
  it('returns dir before first wildcard', () => {
    expect(globBase('/home/x/mods/**/*.jar')).toBe('/home/x/mods');
    expect(globBase('/home/x/mods/*.jar')).toBe('/home/x/mods');
    expect(globBase('/home/x/mods/foo.jar')).toBe('/home/x/mods');
  });

  it('returns empty string when glob has no fixed prefix', () => {
    expect(globBase('*.jar')).toBe('');
    expect(globBase('**/*.jar')).toBe('');
  });

  it('handles brace and bracket wildcards', () => {
    expect(globBase('/x/y/{a,b}/c')).toBe('/x/y');
    expect(globBase('/x/y/[abc]/c')).toBe('/x/y');
  });
});
