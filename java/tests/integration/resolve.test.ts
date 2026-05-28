/**
 * Live integration test — hits the real Adoptium (Eclipse Temurin) API.
 * Run with `npm run test:int`; excluded from the default `npm test`.
 */
import { describe, expect, it } from 'vitest';
import type { BuildContext } from '@lanka/dev';
import { java, resolveOpenjdk } from '../../lib';

const ctx: BuildContext = {
  log: () => {},
  configDir: process.cwd(),
  mode: '',
};

describe('java plugin (live, Adoptium)', () => {
  it('resolves OpenJDK 17 into a manifest contribution', async () => {
    const c = await java('17').build(ctx);

    expect(c.artifacts!.length).toBeGreaterThan(0);
    const archive = c.artifacts![0]!;
    expect(archive.source).toMatchObject({ kind: 'url' });
    expect(archive.integrity).toBeDefined();
    expect(archive.size).toBeGreaterThan(0);
    // The JDK archive must declare how to unpack itself.
    expect(archive.extract).toBeDefined();

    // The plugin solely owns these vars and the `bin` launch group.
    expect(c.vars).toHaveProperty('java_home');
    expect(c.vars).toHaveProperty('java_bin');
    expect(c.launch).toEqual({ bin: '${java_bin}' });
  });

  it('resolveOpenjdk returns hash-pinned binaries for JDK 17', async () => {
    const release = await resolveOpenjdk('17');
    expect(release.major).toBe(17);
    expect(release.releaseName).toMatch(/17/);
    expect(release.binaries.length).toBeGreaterThan(0);
    for (const b of release.binaries) {
      expect(b.url).toMatch(/^https:/);
      expect(b.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(b.size).toBeGreaterThan(0);
    }
  });
});
