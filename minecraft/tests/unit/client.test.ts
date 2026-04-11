import { describe, expect, test } from 'vitest';
import { Client } from '../../lib/client/client';
import { VersionManifest } from '../../lib/version';

describe('Client', () => {
  test('test_decode_latest_release', async () => {
    const manifest = await VersionManifest.fetch();
    const release = manifest.latest();

    const response = await fetch(release.url);
    const json = await response.json();

    const client = Client.CODEC.decode(json as any);
    expect(client).toBeInstanceOf(Client);
    expect(client.id).toBe(release.id);
  });

  test('test_decode_old_version', async () => {
    const manifest = await VersionManifest.fetch();
    const v1_2_5 = manifest.search('1.2.5');
    expect(v1_2_5).toBeDefined();

    const response = await fetch(v1_2_5!.url);
    const json = await response.json();

    const client = Client.CODEC.decode(json as any);
    expect(client).toBeInstanceOf(Client);
    expect(client.id).toBe('1.2.5');
  });
});
