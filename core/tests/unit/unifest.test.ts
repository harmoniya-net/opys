import { describe, expect, it } from 'vitest';
import {
  parseUnifest,
  filterUnifest,
  mergeUnifest,
  totalSize,
  type Unifest,
} from '../../lib/unifest';
import { deduplicateUnifacts } from '../../lib/unifact';
import type { Unifact } from '../../lib/unifact';
import { sourceString } from '../../lib/source';
import { unknownSize, exactSize } from '../../lib/size';
import { skipIntegrity } from '../../lib/integrity';
import { type Launch, parseLaunch } from '../../lib/launch';

const LINUX = { name: 'linux', version: '', arch: 'x86_64' } as const;

function makeUnifact(path: string): Unifact {
  return {
    path,
    source: sourceString('x'),
    size: unknownSize(),
    rules: [],
    integrity: skipIntegrity(),
  };
}

function makeLaunch(command = 'java'): Launch {
  return parseLaunch({ command, workdir: './', args: [], envs: [] });
}

describe('parseUnifest', () => {
  it('parses JSON', async () => {
    const u = await parseUnifest('{}');
    expect(u.unifacts).toHaveLength(0);
  });

  it('throws on invalid JSON', async () => {
    await expect(parseUnifest('{ bad json')).rejects.toThrow();
  });

  it('parses TOML (non-{ prefix)', async () => {
    const u = await parseUnifest('[vars]\n');
    expect(u).toBeDefined();
  });
});

describe('filterUnifest', () => {
  it('returns only matching unifacts (empty rules match all)', () => {
    const u: Unifest = {
      vars: [],
      launch: undefined,
      unifacts: [makeUnifact('a'), makeUnifact('b')],
    };
    expect(filterUnifest(u, LINUX).unifacts).toHaveLength(2);
  });

  it('preserves vars and launch when all unifacts are filtered out', () => {
    const launch = makeLaunch();
    const u: Unifest = {
      vars: [['root', { value: '.', rules: [] }]],
      launch,
      unifacts: [],
    };
    const filtered = filterUnifest(u, LINUX);
    expect(filtered.vars.length).toBe(1);
    expect(filtered.launch).toBeDefined();
    expect(filtered.unifacts).toHaveLength(0);
  });
});

describe('mergeUnifest', () => {
  it("other's launch wins when both have launch", () => {
    const a: Unifest = { vars: [], launch: makeLaunch('java'), unifacts: [] };
    const b: Unifest = { vars: [], launch: makeLaunch('node'), unifacts: [] };
    expect(mergeUnifest(a, b).launch!.command).toBe('node');
  });

  it("keeps this's launch when other has none", () => {
    const a: Unifest = { vars: [], launch: makeLaunch('java'), unifacts: [] };
    const b: Unifest = { vars: [], launch: undefined, unifacts: [] };
    expect(mergeUnifest(a, b).launch!.command).toBe('java');
  });

  it('concatenates unifacts', () => {
    const a: Unifest = { vars: [], unifacts: [makeUnifact('a')] };
    const b: Unifest = {
      vars: [],
      unifacts: [makeUnifact('b'), makeUnifact('c')],
    };
    expect(mergeUnifest(a, b).unifacts).toHaveLength(3);
  });

  it("b's artifact wins when paths collide", () => {
    const first = { ...makeUnifact('libs/foo.jar'), metadata: 'first' };
    const second = { ...makeUnifact('libs/foo.jar'), metadata: 'second' };
    const a: Unifest = { vars: [], unifacts: [first] };
    const b: Unifest = { vars: [], unifacts: [second] };
    const result = mergeUnifest(a, b);
    expect(result.unifacts).toHaveLength(1);
    expect(result.unifacts[0]!.metadata).toBe('second');
  });
});

describe('deduplicateUnifacts', () => {
  it('keeps last entry for duplicate paths', () => {
    const first = { ...makeUnifact('libs/foo.jar'), metadata: 'first' };
    const second = { ...makeUnifact('libs/foo.jar'), metadata: 'second' };
    const result = deduplicateUnifacts([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]!.metadata).toBe('second');
  });

  it('normalizes path before comparing', () => {
    const first = { ...makeUnifact('libs/./foo.jar'), metadata: 'first' };
    const second = { ...makeUnifact('libs/foo.jar'), metadata: 'second' };
    const result = deduplicateUnifacts([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]!.metadata).toBe('second');
  });

  it('preserves insertion order for unique paths', () => {
    const arts = [makeUnifact('a'), makeUnifact('b'), makeUnifact('c')];
    expect(deduplicateUnifacts(arts).map((u) => u.path)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('totalSize', () => {
  it('empty unifests returns exact(0)', () => {
    const u: Unifest = { vars: [], unifacts: [] };
    expect(totalSize(u)).toEqual({ kind: 'exact', bytes: 0 });
  });

  it('sums sizes correctly', () => {
    const a: Unifact = { ...makeUnifact('a'), size: exactSize(100) };
    const b: Unifact = { ...makeUnifact('b'), size: exactSize(200) };
    const u: Unifest = { vars: [], unifacts: [a, b] };
    expect(totalSize(u)).toEqual({ kind: 'exact', bytes: 300 });
  });
});
