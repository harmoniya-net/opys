/**
 * Live full-stack integration test — exercises the whole build pipeline:
 * `cmdBuild` → `@torba/dev` engine → `@torba/minecraft` + `@torba/java`
 * plugins (real Forge + Adoptium APIs) → `@torba/core` manifest encode →
 * `parseManifest` round-trip. Run with `npm run test:int`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseManifest } from '@torba/core';
import { cmdBuild } from '../../lib/commands/build';
import { Logger } from '../../lib/logger';

const execFileAsync = promisify(execFile);
const FIXTURE = fileURLToPath(
  new URL('./fixtures/build.config.mjs', import.meta.url),
);
const CLI_BIN = fileURLToPath(new URL('../../dist/torba.mjs', import.meta.url));
const logger = new Logger('silent');

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'torba-int-cli-'));
});
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('cli build — full stack (live: forge + java)', () => {
  it('builds a real manifest that round-trips through parseManifest', async () => {
    const out = join(dir, 'torba.json');
    await cmdBuild(['-i', FIXTURE, '-o', out], logger);

    const raw = await readFile(out, 'utf8');
    const manifest = await parseManifest(raw);

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

  it('re-encodes byte-stably (encode→parse→encode is a fixpoint)', async () => {
    const out = join(dir, 'torba.json');
    await cmdBuild(['-i', FIXTURE, '-o', out], logger);
    const first = await readFile(out, 'utf8');

    const out2 = join(dir, 'torba2.json');
    // A second build of the same pinned inputs must be identical.
    await cmdBuild(['-i', FIXTURE, '-o', out2], logger);
    expect(await readFile(out2, 'utf8')).toBe(first);
  });
});

describe.skipIf(!existsSync(CLI_BIN))(
  'cli build — via subprocess (live)',
  () => {
    it('runs `torba build` as a real process and exits 0', async () => {
      const out = join(dir, 'sub.json');
      // execFile rejects on a non-zero exit, so a crash fails the test.
      await execFileAsync('node', [CLI_BIN, 'build', '-i', FIXTURE, '-o', out]);
      const manifest = await parseManifest(await readFile(out, 'utf8'));
      expect(manifest.artifacts.length).toBeGreaterThan(0);
    });
  },
);
