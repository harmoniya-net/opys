import { describe, expect, it } from 'vitest';
import { mapClientJar } from '../../lib/mappers/client';
import type { Client } from '@opys/mojang';

const client = {
  downloads: {
    client: {
      url: 'https://piston-data/client.jar',
      sha1: 'f'.repeat(40),
      size: 99,
    },
  },
} as unknown as Client;

describe('mapClientJar', () => {
  it('maps the client download into a url artifact under version_dir', () => {
    const art = mapClientJar(client);
    expect(art.path).toBe('${version_dir}/client.jar');
    expect(art.source).toEqual({
      kind: 'url',
      url: 'https://piston-data/client.jar',
    });
    expect(art.size).toBe(99);
    expect(art.integrity).toEqual({ sha1: 'f'.repeat(40) });
    expect(art.rules).toEqual([]);
  });
});
