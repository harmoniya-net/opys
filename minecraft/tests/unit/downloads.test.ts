import { describe, expect, test } from 'vitest';
import { Downloads, DownloadsFile } from '../../lib/client/downloads';

describe('Downloads', () => {
  test('test_decode_downloads', () => {
    const raw = {
      client: {
        sha1: 'c7d75b81a8c3d22b64a66a1a1db91965f3771960',
        size: 29775010,
        url: 'https://piston-data.mojang.com/v1/objects/c7d75b81a8c3d22b64a66a1a1db91965f3771960/client.jar',
      },
      clientMappings: {
        sha1: '93f0632c0296715fbc79fa9531551065961d56e7',
        size: 10179185,
        url: 'https://piston-data.mojang.com/v1/objects/93f0632c0296715fbc79fa9531551065961d56e7/client.txt',
      },
      server: {
        sha1: 'f18579e000490b8f36611488c0780277bd20b430',
        size: 6185203,
        url: 'https://piston-data.mojang.com/v1/objects/f18579e000490b8f36611488c0780277bd20b430/server.jar',
      },
    };

    const downloads = Downloads.CODEC.decode(raw);
    expect(downloads).toBeInstanceOf(Downloads);
    expect(downloads.client).toBeInstanceOf(DownloadsFile);
    expect(downloads.client.sha1).toBe(
      'c7d75b81a8c3d22b64a66a1a1db91965f3771960',
    );
    expect(downloads.clientMappings).toBeDefined();
    expect(downloads.clientMappings!.sha1).toBe(
      '93f0632c0296715fbc79fa9531551065961d56e7',
    );
    expect(downloads.windowsServer).toBeUndefined();
  });

  test('test_roundtrip', () => {
    const raw = {
      client: {
        sha1: 'sha1',
        size: 100,
        url: 'url',
      },
    };

    const decoded = Downloads.CODEC.decode(raw);
    const encoded = Downloads.CODEC.encode(decoded);
    expect(encoded.client.sha1).toBe('sha1');
  });
});
