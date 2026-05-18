/**
 * Live integration test — hits the real Mojang launcher-meta endpoints.
 * Run with `npm run test:int`; excluded from the default `npm test`.
 */
import { describe, expect, it } from 'vitest';
import { fetchVersionManifest, findVersion, parseClient } from '../../lib';

describe('mojang version manifest (live)', () => {
  it('fetches the manifest and finds a known version', async () => {
    const manifest = await fetchVersionManifest();
    expect(manifest.versions.length).toBeGreaterThan(0);
    expect(manifest.latest.release).toBeTruthy();

    const v = findVersion(manifest, '1.20.1');
    expect(v).toBeDefined();
    expect(v!.url).toMatch(/^https:/);
    expect(v!.sha1).toMatch(/^[0-9a-f]{40}$/);
  });

  it('fetches and parses the real 1.20.1 client JSON', async () => {
    const manifest = await fetchVersionManifest();
    const v = findVersion(manifest, '1.20.1')!;
    const client = parseClient(await (await fetch(v.url)).json());

    expect(client.id).toBe('1.20.1');
    expect(client.mainClass).toContain('Main');
    expect(client.libraries.length).toBeGreaterThan(10);

    // Every resolved library must carry a downloadable, hash-pinned artifact.
    for (const lib of client.libraries) {
      expect(lib.artifact.url).toMatch(/^https:/);
      expect(lib.artifact.sha1).toMatch(/^[0-9a-f]{40}$/);
      expect(lib.artifact.size).toBeGreaterThan(0);
    }

    expect(client.assetIndex.url).toMatch(/^https:/);
    expect(client.downloads.client.sha1).toMatch(/^[0-9a-f]{40}$/);
    expect(client.java.majorVersion).toBeGreaterThanOrEqual(8);
  });
});
