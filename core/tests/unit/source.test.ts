import { describe, expect, it } from 'vitest';
import { Source } from '../../lib/source';

describe('Source', () => {
  it('empty string source is NOT empty', () => {
    const s = Source.string('');
    expect(s.isEmpty()).toBe(false);
    expect(s.isString()).toBe(true);
    expect(s.string()).toBe('');
  });

  it('Source.empty() is empty and not a string', () => {
    const s = Source.empty();
    expect(s.isEmpty()).toBe(true);
    expect(s.isString()).toBe(false);
    expect(s.string()).toBeUndefined();
  });

  it('url() returns undefined for non-url sources', () => {
    expect(Source.file('/path').url()).toBeUndefined();
    expect(Source.string('x').url()).toBeUndefined();
    expect(Source.empty().url()).toBeUndefined();
  });

  it('file() returns undefined for non-file sources', () => {
    expect(Source.url('https://x.com').file()).toBeUndefined();
    expect(Source.string('x').file()).toBeUndefined();
  });

  describe('CODEC round-trips', () => {
    it('url', () => {
      const s = Source.url('https://example.com/file.jar');
      expect(Source.CODEC.decode(Source.CODEC.encode(s)).url()).toBe(
        'https://example.com/file.jar',
      );
    });

    it('file', () => {
      const s = Source.file('/tmp/file.txt');
      expect(Source.CODEC.decode(Source.CODEC.encode(s)).file()).toBe(
        '/tmp/file.txt',
      );
    });

    it('string', () => {
      const s = Source.string('hello');
      expect(Source.CODEC.decode(Source.CODEC.encode(s)).string()).toBe(
        'hello',
      );
    });

    it('empty', () => {
      const s = Source.empty();
      expect(Source.CODEC.decode(Source.CODEC.encode(s)).isEmpty()).toBe(true);
    });

    it('empty string content', () => {
      const s = Source.string('');
      const decoded = Source.CODEC.decode(Source.CODEC.encode(s));
      expect(decoded.isString()).toBe(true);
      expect(decoded.string()).toBe('');
    });
  });
});
