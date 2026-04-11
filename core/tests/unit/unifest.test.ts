import { describe, expect, it } from 'vitest';
import {
  Integrity,
  Launch,
  Source,
  Unifact,
  Unifest,
  UnifactSize,
  ValDef,
  ValDefs,
} from '../../lib';
import { Ruleset, Valset } from '@unifest/rules';

const LINUX = { name: 'linux' as const, version: '', arch: 'x86_64' as const };

function makeUnifact(path: string): Unifact {
  return new Unifact(
    path,
    Source.string('x'),
    UnifactSize.unknown(),
    Ruleset.empty(),
    Integrity.skip(),
    undefined,
    undefined,
  );
}

function makeLaunch(): Launch {
  return new Launch('java', './', new Valset([]), new ValDefs([]));
}

describe('Unifest.parse', () => {
  it('parses JSON', async () => {
    const u = await Unifest.parse('{}');
    expect(u).toBeInstanceOf(Unifest);
    expect(u.unifacts).toHaveLength(0);
  });

  it('throws on invalid JSON', async () => {
    await expect(Unifest.parse('{ bad json')).rejects.toThrow();
  });

  it('parses TOML (non-{ prefix)', async () => {
    const u = await Unifest.parse('[vars]\n');
    expect(u).toBeInstanceOf(Unifest);
  });
});

describe('Unifest.filter', () => {
  it('returns only matching unifacts', () => {
    const linuxUnifact = makeUnifact('linux-only');
    const base = makeUnifact('base');
    const u = new Unifest(new ValDefs([]), undefined, [linuxUnifact, base]);
    // Both have empty ruleset → both match everything
    const filtered = u.filter(LINUX);
    expect(filtered.unifacts).toHaveLength(2);
  });

  it('preserves vars and launch when all unifacts are filtered out', () => {
    const vars = new ValDefs([['root', new ValDef('.', Ruleset.empty())]]);
    const launch = makeLaunch();
    const u = new Unifest(vars, launch, []);
    const filtered = u.filter(LINUX);
    expect(filtered.vars.length).toBe(1);
    expect(filtered.launch).toBeDefined();
    expect(filtered.unifacts).toHaveLength(0);
  });
});

describe('Unifest.merge', () => {
  it("other's launch wins when both have launch", () => {
    const launchA = new Launch('java', './a', new Valset([]), new ValDefs([]));
    const launchB = new Launch('node', './b', new Valset([]), new ValDefs([]));
    const a = new Unifest(new ValDefs([]), launchA, []);
    const b = new Unifest(new ValDefs([]), launchB, []);
    expect(a.merge(b).launch!.command).toBe('node');
  });

  it("keeps this's launch when other has none", () => {
    const launchA = new Launch('java', './', new Valset([]), new ValDefs([]));
    const a = new Unifest(new ValDefs([]), launchA, []);
    const b = new Unifest(new ValDefs([]), undefined, []);
    expect(a.merge(b).launch!.command).toBe('java');
  });

  it('concatenates unifacts from both', () => {
    const a = new Unifest(new ValDefs([]), undefined, [makeUnifact('a')]);
    const b = new Unifest(new ValDefs([]), undefined, [
      makeUnifact('b'),
      makeUnifact('c'),
    ]);
    expect(a.merge(b).unifacts).toHaveLength(3);
  });
});

describe('Unifest.totalSize', () => {
  it('empty unifacts returns exact(0)', () => {
    const u = new Unifest(new ValDefs([]), undefined, []);
    const size = u.totalSize();
    expect(size.isExact()).toBe(true);
    expect(size.bytes()).toBe(0);
  });

  it('sums sizes correctly', () => {
    const a = new Unifact(
      'a',
      Source.string(''),
      UnifactSize.exact(100),
      Ruleset.empty(),
      Integrity.skip(),
      undefined,
      undefined,
    );
    const b = new Unifact(
      'b',
      Source.string(''),
      UnifactSize.exact(200),
      Ruleset.empty(),
      Integrity.skip(),
      undefined,
      undefined,
    );
    const u = new Unifest(new ValDefs([]), undefined, [a, b]);
    expect(u.totalSize().bytes()).toBe(300);
  });
});
