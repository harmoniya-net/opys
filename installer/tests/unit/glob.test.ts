import { describe, expect, it } from 'vitest';
import { matchesGlob } from '../../lib/zip';

describe('matchesGlob', () => {
  describe('exact match (no wildcards)', () => {
    it('matches equal string', () =>
      expect(matchesGlob('a.txt', 'a.txt')).toBe(true));
    it('does not match different string', () =>
      expect(matchesGlob('b.txt', 'a.txt')).toBe(false));
    it('is case-sensitive', () =>
      expect(matchesGlob('A.txt', 'a.txt')).toBe(false));
  });

  describe('trailing * (prefix match)', () => {
    it('* alone matches everything', () => {
      expect(matchesGlob('anything', '*')).toBe(true);
      expect(matchesGlob('a/b/c.txt', '*')).toBe(true);
      expect(matchesGlob('', '*')).toBe(true);
    });

    it('prefix* matches anything starting with prefix', () => {
      expect(matchesGlob('libfoo.so', 'lib*')).toBe(true);
      expect(matchesGlob('lib/foo.so', 'lib*')).toBe(true); // also starts with 'lib'
      expect(matchesGlob('other.so', 'lib*')).toBe(false);
    });

    it('dir/* is distinct from dir* — handled by directory prefix branch', () => {
      // 'lib/*' hits the endsWith('/*') branch: prefix='lib/', checks startsWith
      expect(matchesGlob('lib/foo.so', 'lib/*')).toBe(true);
      expect(matchesGlob('other/foo.so', 'lib/*')).toBe(false);
    });

    it('dir/* is treated as directory prefix (not glob wildcard)', () => {
      // endsWith '/*' → prefix 'dir' → startsWith('dir')
      expect(matchesGlob('dir/file.txt', 'dir/*')).toBe(true);
      expect(matchesGlob('dir/sub/deep.txt', 'dir/*')).toBe(true); // matches nested too
      expect(matchesGlob('other/file.txt', 'dir/*')).toBe(false);
    });
  });

  describe('leading * (suffix match)', () => {
    it('*.so matches any .so file', () => {
      expect(matchesGlob('foo.so', '*.so')).toBe(true);
      expect(matchesGlob('lib/foo.so', '*.so')).toBe(true); // suffix match crosses dirs
      expect(matchesGlob('foo.jar', '*.so')).toBe(false);
    });

    it('*.txt matches at any depth', () => {
      expect(matchesGlob('a/b/c.txt', '*.txt')).toBe(true);
    });
  });

  describe('directory prefix (trailing /)', () => {
    it('META-INF/ matches any file under META-INF/', () => {
      expect(matchesGlob('META-INF/MANIFEST.MF', 'META-INF/')).toBe(true);
      expect(matchesGlob('META-INF/CERT.SF', 'META-INF/')).toBe(true);
      expect(matchesGlob('other/file.txt', 'META-INF/')).toBe(false);
    });

    it('does not match the directory entry itself (empty after prefix)', () => {
      expect(matchesGlob('OTHER/', 'META-INF/')).toBe(false);
    });
  });
});
