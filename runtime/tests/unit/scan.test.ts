import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceUrl, type Artifact, type Manifest } from '@torba/core';
import { scan } from '../../lib/phases/scan';

const LINUX = { name: 'linux', version: '', arch: 'x86_64' } as const;

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'torba-scan-phase-'));
});
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const art = (path: string, rules: Artifact['rules'] = []): Artifact => ({
  path,
  source: sourceUrl(`https://h/${path}`),
  rules,
});

describe('scan', () => {
  it('produces a task per applicable, not-yet-present artifact', () => {
    const manifest: Manifest = {
      vars: {},
      artifacts: [art(join(dir, 'a.jar')), art(join(dir, 'b.jar'))],
    };
    const result = scan(manifest, {}, LINUX);
    expect(result.tasks).toHaveLength(2);
    expect(result.skipped).toBe(0);
    expect(result.tasks[0]!.idx).toBe(0);
  });

  it('skips artifacts already present on disk', async () => {
    const present = join(dir, 'have.jar');
    await writeFile(present, 'x');
    const manifest: Manifest = {
      vars: {},
      artifacts: [art(present), art(join(dir, 'missing.jar'))],
    };
    const result = scan(manifest, {}, LINUX);
    expect(result.skipped).toBe(1);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.artifact.path).toBe(join(dir, 'missing.jar'));
  });

  it('re-fetches a present artifact whose path is in the force set', async () => {
    const present = join(dir, 'have.jar');
    await writeFile(present, 'x');
    const manifest: Manifest = { vars: {}, artifacts: [art(present)] };
    const result = scan(manifest, {}, LINUX, [], new Set([present]));
    expect(result.skipped).toBe(0);
    expect(result.tasks).toHaveLength(1);
  });

  it('interpolates ${var} in the artifact path', () => {
    const manifest: Manifest = {
      vars: {},
      artifacts: [art('${root}/a.jar')],
    };
    const result = scan(manifest, { root: dir }, LINUX);
    expect(result.tasks[0]!.finalPath).toBe(join(dir, 'a.jar'));
  });

  it('filters out artifacts excluded by their rules', () => {
    const manifest: Manifest = {
      vars: {},
      artifacts: [
        art(join(dir, 'win.jar'), [
          { action: 'allow', os: { name: 'windows' } },
        ]),
        art(join(dir, 'all.jar')),
      ],
    };
    const result = scan(manifest, {}, LINUX);
    expect(result.tasks.map((t) => t.artifact.path)).toEqual([
      join(dir, 'all.jar'),
    ]);
  });

  it('honors feature flags', () => {
    const manifest: Manifest = {
      vars: {},
      artifacts: [
        art(join(dir, 'demo.jar'), [
          { action: 'allow', features: { demo: true } },
        ]),
      ],
    };
    expect(scan(manifest, {}, LINUX).tasks).toHaveLength(0);
    expect(scan(manifest, {}, LINUX, ['demo']).tasks).toHaveLength(1);
  });
});
