import { afterAll, describe, expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveMinecraft } from '@torba/minecraft';
import { Manifest } from '@torba/core';
import { install } from '../../lib/install';

const VERSION = '1.20.1';
// 10 minutes — assets alone are ~300 MB across ~3500 files on a cold cache
const TIMEOUT = 10 * 60_000;

describe.skip('Full Minecraft template installation', () => {
  let tmpRoot = '';

  afterAll(async () => {
    if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
  });

  test(
    'resolveMinecraft() → install() downloads and verifies all artifacts',
    async () => {
      tmpRoot = await mkdtemp(join(tmpdir(), 'unipack-int-'));

      const mc = await resolveMinecraft({ version: VERSION });
      const manifest = new Manifest(mc.vars, mc.launch, mc.artifacts);

      const phases: string[] = [];
      let downloadTotal = 0;

      await install(manifest, {
        vars: { root: tmpRoot },
        verifyIntegrity: true,
        onProgress(p) {
          switch (p.phase) {
            case 'download':
              if (p.fetched === 0) {
                downloadTotal = p.total;
                phases.push(`download:${p.total}`);
              }
              break;
            case 'verify':
              phases.push('verify');
              break;
            case 'extract':
              phases.push(`extract:${p.count}`);
              break;
          }
        },
      });

      // At least one file was downloaded (cold cache)
      expect(downloadTotal).toBeGreaterThan(0);

      // Phase ordering: download always before verify
      const downloadIdx = phases.findIndex((p) => p.startsWith('download:'));
      const verifyIdx = phases.indexOf('verify');
      expect(downloadIdx).toBeGreaterThanOrEqual(0);
      expect(verifyIdx).toBeGreaterThan(downloadIdx);

      // client.jar
      expect(existsSync(join(tmpRoot, 'versions', VERSION, 'client.jar'))).toBe(
        true,
      );

      // asset index JSON
      expect(
        existsSync(join(tmpRoot, 'assets', 'indexes', `${VERSION}.json`)),
      ).toBe(true);

      // at least some asset objects
      const objectsDir = join(tmpRoot, 'assets', 'objects');
      expect(existsSync(objectsDir)).toBe(true);
      const buckets = await readdir(objectsDir);
      expect(buckets.length).toBeGreaterThan(0);

      // at least one library jar
      const libsDir = join(tmpRoot, 'libraries');
      expect(existsSync(libsDir)).toBe(true);
      const libEntries = await readdir(libsDir);
      expect(libEntries.length).toBeGreaterThan(0);

      // natives extracted (linux: lwjgl, osx/windows: their own natives)
      const nativesDir = join(tmpRoot, 'versions', VERSION, 'natives');
      expect(existsSync(nativesDir)).toBe(true);
    },
    TIMEOUT,
  );

  test('re-install skips all cached files (zero downloads)', async () => {
    // tmpRoot is already populated by the previous test
    expect(tmpRoot).toBeTruthy();

    const mc = await resolveMinecraft({ version: VERSION });
    const manifest = new Manifest(mc.vars, mc.launch, mc.artifacts);

    let downloadTotal = 0;
    let skipped = 0;

    await install(manifest, {
      vars: { root: tmpRoot },
      verifyIntegrity: false,
      onProgress(p) {
        if (p.phase === 'download' && p.fetched === 0) {
          downloadTotal = p.total;
          skipped = p.skipped;
        }
      },
    });

    expect(downloadTotal).toBe(0);
    expect(skipped).toBeGreaterThan(0);
  }, 60_000);

  test('integrity verification passes on all installed files', async () => {
    expect(tmpRoot).toBeTruthy();

    const mc = await resolveMinecraft({ version: VERSION });
    const manifest = new Manifest(mc.vars, mc.launch, mc.artifacts);

    // Should not throw — all files already on disk and intact
    await expect(
      install(manifest, {
        vars: { root: tmpRoot },
        verifyIntegrity: true,
      }),
    ).resolves.toBeUndefined();
  }, 120_000);
});
