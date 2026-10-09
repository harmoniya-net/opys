import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Manifest } from '@opys/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BUNDLE_FORMAT,
  blobBytes,
  blobFile,
  blobId,
  readBundle,
  readBundleHead,
  writeBundle,
} from '../../lib/index';

// The crate's own tests cover the layout and what a reader refuses. These
// cover what the wrapper adds: the typed surface, and a path in place of a
// reader.
describe('a bundle on disk', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opys-bundle-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const hello = new TextEncoder().encode('hello');
  const manifest: Manifest = {
    vars: { root: '.' },
    launch: { command: 'java', workdir: '${root}', args: [], envs: {} },
    artifacts: [
      { path: '${root}/hello.txt', source: { blob: blobId(hello) }, size: 5 },
    ],
  };

  it('reads back as the manifest it was written from', async () => {
    const path = join(dir, 'game.opys');
    await writeBundle(path, manifest, { [blobId(hello)]: blobBytes(hello) });
    const read = readBundle(path);
    expect(read.vars).toEqual(manifest.vars);
    expect(read.launch).toEqual(manifest.launch);
    expect(read.artifacts[0]?.source).toEqual({ blob: blobId(hello) });
  });

  it('says its format in a head that holds nothing of the manifest', async () => {
    const path = join(dir, 'game.opys');
    await writeBundle(path, manifest, { [blobId(hello)]: blobBytes(hello) });
    expect(readBundleHead(path)).toEqual({ format: BUNDLE_FORMAT });
  });

  it('refuses to write a manifest whose blob nothing holds', async () => {
    const path = join(dir, 'game.opys');
    await expect(writeBundle(path, manifest)).rejects.toThrow(
      /names blob .* and nothing holds it/,
    );
  });

  it('names a blob by the sha256 of its bytes, held as a file or as base64', () => {
    expect(blobId(hello)).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(blobBytes(hello)).toEqual({ bytes: 'aGVsbG8=' });
    expect(blobFile('/srv/a.jar')).toEqual({ file: '/srv/a.jar' });
  });

  it('refuses a file that is not a bundle', () => {
    const path = join(dir, 'manifest.json');
    writeFileSync(path, JSON.stringify(manifest));
    expect(() => readBundle(path)).toThrow(/not a bundle/);
    expect(() => readBundleHead(path)).toThrow(/not a bundle/);
  });
});
