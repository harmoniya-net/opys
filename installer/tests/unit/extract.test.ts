import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

// extractZip is an internal — test it through the public install() API.
// We create a Unifest with a file source pointing at a temp zip, with an ExtractDump rule.
import {
  Extract,
  ExtractDump,
  Integrity,
  Source,
  Unifact,
  Unifest,
  UnifactSize,
  ValDefs,
} from '@unifest/core';
import { Ruleset } from '@unifest/rules';
import { install } from '../../lib/install';

function makeZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = strToU8(content);
  }
  return zipSync(entries);
}

function makeManifest(unifacts: Unifact[]): Unifest {
  return new Unifest(new ValDefs([]), undefined, unifacts);
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'unipack-extract-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('ExtractDump runtime', () => {
  it('dumps all zip entries into target dir', async () => {
    const zip = makeZip({
      'a.txt': 'hello',
      'sub/b.txt': 'world',
    });
    // Source and artifact paths are distinct so the file gets "downloaded" (copied) by install
    const sourceZip = join(tmpDir, 'source.zip');
    const artifactPath = join(tmpDir, 'archive.zip');
    await writeFile(sourceZip, zip);

    const targetDir = join(tmpDir, 'out');

    const unifact = new Unifact(
      artifactPath,
      Source.file(sourceZip),
      UnifactSize.unknown(),
      Ruleset.empty(),
      Integrity.skip(),
      undefined,
      new Extract([new ExtractDump(targetDir, undefined, undefined)]),
    );

    await install(makeManifest([unifact]));

    expect(existsSync(join(targetDir, 'a.txt'))).toBe(true);
    expect(await readFile(join(targetDir, 'a.txt'), 'utf8')).toBe('hello');
    expect(existsSync(join(targetDir, 'sub/b.txt'))).toBe(true);
    expect(await readFile(join(targetDir, 'sub/b.txt'), 'utf8')).toBe('world');
  });

  it('respects excludes', async () => {
    const zip = makeZip({
      'keep.txt': 'keep',
      'META-INF/MANIFEST.MF': 'manifest',
      'META-INF/CERT.SF': 'cert',
    });
    const sourceZip = join(tmpDir, 'source.zip');
    const artifactPath = join(tmpDir, 'archive.zip');
    await writeFile(sourceZip, zip);

    const targetDir = join(tmpDir, 'out');

    const unifact = new Unifact(
      artifactPath,
      Source.file(sourceZip),
      UnifactSize.unknown(),
      Ruleset.empty(),
      Integrity.skip(),
      undefined,
      new Extract([new ExtractDump(targetDir, undefined, ['META-INF/'])]),
    );

    await install(makeManifest([unifact]));

    expect(existsSync(join(targetDir, 'keep.txt'))).toBe(true);
    expect(existsSync(join(targetDir, 'META-INF/MANIFEST.MF'))).toBe(false);
  });

  it('respects includes: only matching files are extracted', async () => {
    const zip = makeZip({
      'foo.so': 'native',
      'readme.txt': 'docs',
      'config.ini': 'settings',
    });
    const sourceZip = join(tmpDir, 'source.zip');
    const artifactPath = join(tmpDir, 'archive.zip');
    await writeFile(sourceZip, zip);

    const targetDir = join(tmpDir, 'out');

    const unifact = new Unifact(
      artifactPath,
      Source.file(sourceZip),
      UnifactSize.unknown(),
      Ruleset.empty(),
      Integrity.skip(),
      undefined,
      new Extract([new ExtractDump(targetDir, ['*.so'], undefined)]),
    );

    await install(makeManifest([unifact]));

    expect(existsSync(join(targetDir, 'foo.so'))).toBe(true);
    expect(existsSync(join(targetDir, 'readme.txt'))).toBe(false);
    expect(existsSync(join(targetDir, 'config.ini'))).toBe(false);
  });

  it('clean wipes target dir before first extraction', async () => {
    const targetDir = join(tmpDir, 'natives');
    await import('node:fs/promises').then((fs) =>
      fs
        .mkdir(targetDir, { recursive: true })
        .then(() => fs.writeFile(join(targetDir, 'stale.so'), 'old')),
    );

    const zip = makeZip({ 'fresh.so': 'new' });
    const sourceZip = join(tmpDir, 'source.zip');
    const artifactPath = join(tmpDir, 'archive.zip');
    await writeFile(sourceZip, zip);

    const unifact = new Unifact(
      artifactPath,
      Source.file(sourceZip),
      UnifactSize.unknown(),
      Ruleset.empty(),
      Integrity.skip(),
      undefined,
      new Extract([new ExtractDump(targetDir, undefined, undefined, true)]),
    );

    await install(makeManifest([unifact]));

    expect(existsSync(join(targetDir, 'stale.so'))).toBe(false);
    expect(existsSync(join(targetDir, 'fresh.so'))).toBe(true);
  });

  it('skips extraction when artifact is already cached', async () => {
    const zip = makeZip({ 'file.txt': 'content' });
    const artifactPath = join(tmpDir, 'archive.zip');
    // Write zip directly to the artifact path — simulates a prior install run
    await writeFile(artifactPath, zip);

    const targetDir = join(tmpDir, 'out');

    const unifact = new Unifact(
      artifactPath,
      Source.file(artifactPath),
      UnifactSize.unknown(),
      Ruleset.empty(),
      Integrity.skip(),
      undefined,
      new Extract([new ExtractDump(targetDir, undefined, undefined)]),
    );

    await install(makeManifest([unifact]));

    // Artifact was cached → no download → no extraction
    expect(existsSync(join(targetDir, 'file.txt'))).toBe(false);
  });
});
