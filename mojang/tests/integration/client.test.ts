import { describe, expect, test } from 'vitest';
import { Client } from '../../lib/client/client';
import { VersionManifest } from '../../lib/version';

describe('Client Integration', () => {
  const versions = [
    'rd-132211',
    '1.0',
    '1.1',
    '1.2.5',
    '1.3.2',
    '1.4.6',
    '1.5.2',
    '1.6.4',
    '1.7',
    '1.7.10',
    '1.8.9',
    '1.9.4',
    '1.10.2',
    '1.11.2',
    '1.12.2',
    '1.13',
    '1.14.4',
    '1.15.2',
    '1.16.5',
    '1.17.1',
    '1.18.2',
    '1.19.4',
    '1.20.6',
    '1.21.1',
  ];

  test('specific_versions', async () => {
    const manifest = await VersionManifest.fetch();

    for (const id of versions) {
      const entry = manifest.search(id);
      expect(entry).toBeDefined();

      const response = await fetch(entry!.url);
      expect(response.ok).toBe(true);

      const json = await response.json();
      const client = Client.CODEC.decode(json as any);

      expect(client).toBeInstanceOf(Client);
      expect(client.id).toBe(id);
    }
  }, 60000); // 60s timeout for many fetches

  test('latest_versions', async () => {
    const manifest = await VersionManifest.fetch();

    const releaseEntry = manifest.latest();
    const snapshotEntry = manifest.snapshot();

    for (const entry of [releaseEntry, snapshotEntry]) {
      const response = await fetch(entry.url);
      expect(response.ok).toBe(true);

      const json = await response.json();
      const client = Client.CODEC.decode(json as any);

      expect(client).toBeInstanceOf(Client);
      expect(client.id).toBe(entry.id);
    }
  }, 20000);
});
