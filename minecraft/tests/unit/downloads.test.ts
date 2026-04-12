import { describe, expect, it } from 'vitest';
import { DownloadsSchema } from '../../lib/client/downloads';

describe('DownloadsSchema', () => {
  it('parses client download', () => {
    const raw = {
      client: {
        sha1: 'abc123',
        size: 12345,
        url: 'https://example.com/client.jar',
      },
    };
    const d = DownloadsSchema.parse(raw);
    expect(d.client.sha1).toBe('abc123');
    expect(d.server).toBeUndefined();
  });

  it('parses optional server download', () => {
    const raw = {
      client: { sha1: 'abc', size: 1, url: 'https://c.com/c.jar' },
      server: { sha1: 'def', size: 2, url: 'https://c.com/s.jar' },
    };
    const d = DownloadsSchema.parse(raw);
    expect(d.server?.sha1).toBe('def');
  });
});
