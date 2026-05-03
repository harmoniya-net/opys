import { describe, expect, test } from 'vitest';
import { VersionManifest } from '../../lib/version';

describe('VersionManifest', () => {
  test('search_version', async () => {
    const manifest = await VersionManifest.fetch();
    const version = manifest.search('1.16.5');

    expect(version).toBeDefined();
    expect(version?.id).toBe('1.16.5');
  });
});
