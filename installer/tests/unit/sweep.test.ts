import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sweep } from '../../lib/phases/sweep';
import { EXTRACT_MARKER_SUFFIX } from '../../lib/phases/extract';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'torba-sweep-'));
});

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const touch = async (rel: string, body = '') => {
  const abs = join(dir, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body);
  return abs;
};

describe('sweep', () => {
  it('deletes orphan files matching the glob', async () => {
    const keep = await touch('mods/keep.jar');
    const orphan = await touch('mods/orphan.jar');

    const result = await sweep(
      [`${dir}/mods/**/*.jar`],
      {},
      { managed: new Set([keep]) },
    );

    expect(existsSync(keep)).toBe(true);
    expect(existsSync(orphan)).toBe(false);
    expect(result.removed).toEqual([orphan]);
  });

  it('leaves files that do not match the glob alone', async () => {
    const orphanJar = await touch('mods/orphan.jar');
    const orphanTxt = await touch('mods/orphan.txt');

    const result = await sweep(
      [`${dir}/mods/**/*.jar`],
      {},
      { managed: new Set() },
    );

    expect(existsSync(orphanJar)).toBe(false);
    expect(existsSync(orphanTxt)).toBe(true); // doesn't match *.jar
    expect(result.removed).toEqual([orphanJar]);
  });

  it('recurses into subdirs', async () => {
    const keep = await touch('mods/sub/keep.jar');
    const orphan = await touch('mods/sub/orphan.jar');
    const deepOrphan = await touch('mods/a/b/c/deep.jar');

    const result = await sweep(
      [`${dir}/mods/**/*.jar`],
      {},
      { managed: new Set([keep]) },
    );

    expect(existsSync(keep)).toBe(true);
    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(deepOrphan)).toBe(false);
    // removed includes orphan files plus pruned empty parent dirs
    expect(result.removed).toContain(orphan);
    expect(result.removed).toContain(deepOrphan);
  });

  it('prunes empty subdirs but keeps the restrict base', async () => {
    const orphan = await touch('mods/old/foo.jar');

    await sweep([`${dir}/mods/**/*.jar`], {}, { managed: new Set() });

    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(join(dir, 'mods', 'old'))).toBe(false); // pruned
    expect(existsSync(join(dir, 'mods'))).toBe(true); // base preserved
  });

  it('preserves torba bookkeeping files', async () => {
    const archive = await touch('runtimes/jdk-17/.cache/openjdk.tar.gz');
    const marker = await touch(
      `runtimes/jdk-17/.cache/openjdk.tar.gz${EXTRACT_MARKER_SUFFIX}`,
    );

    await sweep([`${dir}/runtimes/**/*`], {}, { managed: new Set() });

    expect(existsSync(archive)).toBe(true); // .cache/ is auto-ignored
    expect(existsSync(marker)).toBe(true); // marker suffix is auto-ignored
  });

  it('interpolates ${var} in globs', async () => {
    const keep = await touch('mods/keep.jar');
    const orphan = await touch('mods/orphan.jar');

    await sweep(
      ['${root}/mods/**/*.jar'],
      { root: dir },
      { managed: new Set([keep]) },
    );

    expect(existsSync(keep)).toBe(true);
    expect(existsSync(orphan)).toBe(false);
  });

  it('no-op when restrict list is empty', async () => {
    const f = await touch('mods/anything.jar');
    const result = await sweep([], {}, { managed: new Set() });
    expect(existsSync(f)).toBe(true);
    expect(result.removed).toEqual([]);
  });

  it('skips when base directory does not exist', async () => {
    const result = await sweep(
      [`${dir}/nonexistent/**/*.jar`],
      {},
      { managed: new Set() },
    );
    expect(result.removed).toEqual([]);
  });
});
