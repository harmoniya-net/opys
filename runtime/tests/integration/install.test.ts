/**
 * Live integration test — downloads a real artifact from Maven Central
 * (immutable, hash-stable) and runs it through the full install pipeline:
 * fetch → integrity verify. Run with `npm run test:int`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceUrl, type Manifest } from '@torba/core';
import { install } from '../../lib';

// gson 2.10.1 — a Maven Central artifact; immutable, so url/sha1/size are fixed.
const GSON = {
  url: 'https://repo1.maven.org/maven2/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar',
  sha1: 'b3add478d4382b78ea20b1671390a858002feb6c',
  size: 283367,
};

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'torba-int-install-'));
});
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('runtime install (live, Maven Central)', () => {
  it('downloads a real artifact and verifies its declared hash', async () => {
    const dest = join(dir, 'gson.jar');
    const manifest: Manifest = {
      vars: {},
      artifacts: [
        {
          path: dest,
          source: sourceUrl(GSON.url),
          size: GSON.size,
          rules: [],
          integrity: { sha1: GSON.sha1 },
        },
      ],
    };
    await install(manifest);
    expect(existsSync(dest)).toBe(true);
    expect((await stat(dest)).size).toBe(GSON.size);
  });

  it('skips the download when a correct copy is already present', async () => {
    const dest = join(dir, 'gson.jar');
    const manifest: Manifest = {
      vars: {},
      artifacts: [
        {
          path: dest,
          source: sourceUrl(GSON.url),
          rules: [],
          integrity: { sha1: GSON.sha1 },
        },
      ],
    };
    await install(manifest); // first run downloads
    let downloaded = -1;
    await install(manifest, {
      onProgress: (p) => {
        if (p.phase === 'download') downloaded = p.total;
      },
    });
    expect(downloaded).toBe(0); // second run: nothing to fetch
  });

  it('throws IntegrityError when the real bytes fail the declared hash', async () => {
    const dest = join(dir, 'gson.jar');
    const manifest: Manifest = {
      vars: {},
      artifacts: [
        {
          path: dest,
          source: sourceUrl(GSON.url),
          rules: [],
          integrity: { sha1: '0'.repeat(40) },
        },
      ],
    };
    await expect(install(manifest)).rejects.toThrow(/Integrity check failed/);
  });
});
