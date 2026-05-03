import { describe, expect, it } from 'vitest';
import {
  parseManifest,
  filterManifest,
  type Manifest,
} from '../../lib/manifest';
import { deduplicateArtifacts } from '../../lib/artifact';
import type { Artifact } from '../../lib/artifact';
import { sourceString } from '../../lib/source';
import { type Launch, parseLaunch } from '../../lib/launch';

const LINUX = { name: 'linux', version: '', arch: 'x86_64' } as const;

function makeArtifact(path: string): Artifact {
  return {
    path,
    source: sourceString('x'),
    rules: [],
  };
}

function makeLaunch(command = 'java'): Launch {
  return parseLaunch({ command, workdir: './', args: [], envs: {} });
}

describe('parseManifest', () => {
  it('parses JSON', async () => {
    const u = await parseManifest('{}');
    expect(u.artifacts).toHaveLength(0);
  });

  it('throws on invalid JSON', async () => {
    await expect(parseManifest('{ bad json')).rejects.toThrow();
  });
});

describe('filterManifest', () => {
  it('returns only matching artifacts (empty rules match all)', () => {
    const u: Manifest = {
      vars: {},
      launch: undefined,
      artifacts: [makeArtifact('a'), makeArtifact('b')],
    };
    expect(filterManifest(u, LINUX).artifacts).toHaveLength(2);
  });

  it('preserves vars and launch when all artifacts are filtered out', () => {
    const launch = makeLaunch();
    const u: Manifest = {
      vars: { root: '.' },
      launch,
      artifacts: [],
    };
    const filtered = filterManifest(u, LINUX);
    expect(filtered.vars).toEqual({ root: '.' });
    expect(filtered.launch).toBeDefined();
    expect(filtered.artifacts).toHaveLength(0);
  });
});

describe('deduplicateArtifacts', () => {
  it('keeps last entry for duplicate paths', () => {
    const first = { ...makeArtifact('libs/foo.jar'), metadata: 'first' };
    const second = { ...makeArtifact('libs/foo.jar'), metadata: 'second' };
    const result = deduplicateArtifacts([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]!.metadata).toBe('second');
  });

  it('normalizes path before comparing', () => {
    const first = { ...makeArtifact('libs/./foo.jar'), metadata: 'first' };
    const second = { ...makeArtifact('libs/foo.jar'), metadata: 'second' };
    const result = deduplicateArtifacts([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]!.metadata).toBe('second');
  });

  it('preserves insertion order for unique paths', () => {
    const arts = [makeArtifact('a'), makeArtifact('b'), makeArtifact('c')];
    expect(deduplicateArtifacts(arts).map((u) => u.path)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
