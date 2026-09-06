/**
 * Live integration tests — hit the real Adoptium (Temurin), Azul (Zulu),
 * and GitHub (GraalVM CE) APIs. Run with `npm run test:int`; excluded from
 * the default `npm test`.
 */
import { describe, expect, it } from 'vitest';
import type { BuildContext } from '@opys/dev';
import { java, resolveTemurin, resolveZulu, resolveGraalvm } from '../../lib';

const ctx: BuildContext = {
  log: () => {},
  configDir: process.cwd(),
  mode: '',
};

describe('java plugin (live, Temurin)', () => {
  it('resolves a JDK into a manifest contribution', async () => {
    const c = await java('17').build(ctx);

    expect(c.artifacts!.length).toBeGreaterThan(0);
    const archive = c.artifacts![0]!;
    expect(archive.source).toHaveProperty('url');
    expect(archive.integrity).toBeDefined();
    expect(archive.size).toBeGreaterThan(0);
    // The JDK archive must declare how to unpack itself.
    expect(archive.extract).toBeDefined();

    // The plugin solely owns these vars and the `bin` launch group.
    expect(c.vars).toHaveProperty('java_home');
    expect(c.vars).toHaveProperty('java_bin');
    expect(c.launch).toEqual({ bin: '${java_bin}' });
  });

  it('resolveTemurin returns hash-pinned binaries for JDK 17', async () => {
    const release = await resolveTemurin('17');
    expect(release.major).toBe(17);
    expect(release.label).toMatch(/17/);
    expect(release.binaries.length).toBeGreaterThan(0);
    for (const b of release.binaries) {
      expect(b.url).toMatch(/^https:/);
      expect(b.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(b.size).toBeGreaterThan(0);
    }
  });
});

describe('resolveZulu (live, Azul)', () => {
  it('returns hash-pinned binaries for JDK 21', async () => {
    const release = await resolveZulu('21');
    expect(release.major).toBe(21);
    expect(release.label).toMatch(/Zulu/);
    expect(release.binaries.length).toBeGreaterThan(0);
    for (const b of release.binaries) {
      expect(b.url).toMatch(/^https:/);
      expect(b.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(b.size).toBeGreaterThan(0);
    }
  });
});

describe('resolveGraalvm (live, GitHub)', () => {
  it('returns binaries for the latest JDK 21 release', async () => {
    const release = await resolveGraalvm('21');
    expect(release.major).toBe(21);
    expect(release.label).toMatch(/GraalVM CE/);
    expect(release.binaries.length).toBeGreaterThan(0);
    for (const b of release.binaries) {
      expect(b.url).toMatch(/^https:/);
      expect(b.size).toBeGreaterThan(0);
      // Either a build-time digest or an install-time discovery fallback —
      // never shipped with zero integrity verification.
      expect(b.sha256 ?? b.discovery?.integrity?.url).toBeDefined();
    }
  });
});
