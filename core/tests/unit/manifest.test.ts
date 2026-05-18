import { describe, expect, it } from 'vitest';
import {
  parseManifest,
  filterManifest,
  decodeManifest,
  encodeManifest,
  type Manifest,
} from '../../lib/manifest';
import { decodeArtifact, deduplicateArtifacts } from '../../lib/artifact';
import type { Artifact } from '../../lib/artifact';
import { sourceString } from '../../lib/source';
import { type Launch, decodeLaunch } from '../../lib/launch';

const LINUX = { name: 'linux', version: '', arch: 'x86_64' } as const;

function makeArtifact(path: string): Artifact {
  return {
    path,
    source: sourceString('x'),
    rules: [],
  };
}

function makeLaunch(command = 'java'): Launch {
  return decodeLaunch({ command, workdir: './', args: [], envs: {} });
}

describe('parseManifest', () => {
  it('parses JSON', async () => {
    const u = await parseManifest('{}');
    expect(u.artifacts).toHaveLength(0);
  });

  it('throws on invalid JSON', async () => {
    await expect(parseManifest('{ bad json')).rejects.toThrow(
      /Failed to parse manifest/,
    );
  });

  it('throws on a schema-invalid manifest', async () => {
    await expect(parseManifest('{ "artifacts": 5 }')).rejects.toThrow(
      /Failed to parse manifest/,
    );
  });

  it('parses a manifest with artifacts, vars, launch and restrict', async () => {
    const u = await parseManifest(
      JSON.stringify({
        vars: { root: '.' },
        launch: { command: 'java', workdir: '.' },
        artifacts: [{ path: 'a.jar', source: { url: 'https://x' } }],
        restrict: ['mods/**'],
      }),
    );
    expect(u.vars).toEqual({ root: '.' });
    expect(u.launch?.command).toBe('java');
    expect(u.artifacts).toHaveLength(1);
    expect(u.restrict).toEqual(['mods/**']);
  });
});

describe('decodeManifest / encodeManifest', () => {
  it('round-trips a minimal manifest', () => {
    const wire = { artifacts: [{ path: 'a', source: { string: 'x' } }] };
    expect(encodeManifest(decodeManifest(wire))).toEqual({
      vars: {},
      artifacts: [{ path: 'a', source: { string: 'x' } }],
    });
  });

  it('round-trips vars, launch and restrict', () => {
    const wire = {
      vars: { root: '.' },
      launch: { command: 'java', workdir: '/srv', args: ['-jar'] },
      artifacts: [],
      restrict: ['mods/**'],
    };
    const encoded = encodeManifest(decodeManifest(wire));
    expect(encoded.vars).toEqual({ root: '.' });
    expect(encoded.launch?.command).toBe('java');
    expect(encoded.restrict).toEqual(['mods/**']);
  });

  it('omits an empty restrict array on encode', () => {
    const m: Manifest = { vars: {}, artifacts: [], restrict: [] };
    expect(encodeManifest(m).restrict).toBeUndefined();
  });

  it('defaults missing vars and artifacts', () => {
    const m = decodeManifest({});
    expect(m.vars).toEqual({});
    expect(m.artifacts).toEqual([]);
    expect(m.restrict).toBeUndefined();
    expect(m.launch).toBeUndefined();
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

  it('drops artifacts whose rules exclude the target OS', () => {
    const linuxOnly = decodeArtifact({
      path: 'l',
      source: { string: 'x' },
      rules: 'allow.os.linux',
    });
    const u: Manifest = { vars: {}, artifacts: [linuxOnly, makeArtifact('b')] };
    expect(filterManifest(u, LINUX).artifacts).toHaveLength(2);
    expect(
      filterManifest({ ...u }, { name: 'osx', version: '', arch: 'x86_64' })
        .artifacts,
    ).toEqual([expect.objectContaining({ path: 'b' })]);
  });

  it('preserves restrict through filtering', () => {
    const u: Manifest = { vars: {}, artifacts: [], restrict: ['mods/**'] };
    expect(filterManifest(u, LINUX).restrict).toEqual(['mods/**']);
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
