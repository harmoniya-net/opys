/**
 * Live full-stack integration test — exercises the whole build pipeline:
 * `cmdBuild` → `@opys/dev` engine → `@opys/minecraft` + `@opys/java`
 * plugins (real Forge + Adoptium APIs) → `@opys/core` bundle write →
 * `readBundle` round-trip. Run with `npm run test:int`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readBundle } from '@opys/bundle';
import { cmdBuild } from '../../lib/commands/build';
import { Logger } from '../../lib/logger';

const execFileAsync = promisify(execFile);
const FIXTURE = fileURLToPath(
  new URL('./fixtures/build.config.mjs', import.meta.url),
);
const CLI_BIN = fileURLToPath(new URL('../../dist/opys.mjs', import.meta.url));
const logger = new Logger('silent');

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'opys-int-cli-'));
});
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('cli build — full stack (live: forge + java)', () => {
  it('builds a real bundle that reads back as its manifest', async () => {
    const out = join(dir, 'game.opys');
    await cmdBuild(['-i', FIXTURE, '-o', out], logger, 'build');

    const manifest = readBundle(out);

    // Forge contributes loader + library artifacts; java contributes the JDK.
    expect(manifest.artifacts.length).toBeGreaterThan(0);
    for (const a of manifest.artifacts) {
      expect(a.path).toBeTruthy();
      expect(a.source).toBeDefined();
    }

    // Launch surface assembled from the plugins' launch groups.
    expect(manifest.launch).toBeDefined();
    expect(manifest.launch!.command).toBeTruthy();
    expect(manifest.launch!.workdir).toBe('${game_directory}');

    // The java plugin owns these vars.
    expect(manifest.vars).toHaveProperty('java_bin');
  });

  it('builds byte-stably: two builds of the same pinned inputs are one file', async () => {
    const out = join(dir, 'game.opys');
    await cmdBuild(['-i', FIXTURE, '-o', out], logger, 'build');
    const first = await readFile(out);

    const out2 = join(dir, 'game2.opys');
    await cmdBuild(['-i', FIXTURE, '-o', out2], logger, 'build');
    expect((await readFile(out2)).equals(first)).toBe(true);
  });
});

describe.skipIf(!existsSync(CLI_BIN))(
  'cli build — via subprocess (live)',
  () => {
    it('runs `opys build` as a real process and exits 0', async () => {
      const out = join(dir, 'sub.opys');
      // execFile rejects on a non-zero exit, so a crash fails the test.
      await execFileAsync('node', [CLI_BIN, 'build', '-i', FIXTURE, '-o', out]);
      expect(readBundle(out).artifacts.length).toBeGreaterThan(0);
    });
  },
);
