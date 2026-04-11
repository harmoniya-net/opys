import { describe, expect, it } from 'vitest';
import { ValDef, ValDefs } from '../../lib/valdefs';
import { Ruleset } from '@unifest/rules';

const LINUX = { name: 'linux' as const, version: '', arch: 'x86_64' as const };
const WINDOWS = {
  name: 'windows' as const,
  version: '10',
  arch: 'x86_64' as const,
};

describe('ValDefs.resolve', () => {
  it('last matching entry wins for duplicate keys', () => {
    const defs = new ValDefs([
      ['cp', new ValDef('first', Ruleset.empty())],
      ['cp', new ValDef('second', Ruleset.empty())],
    ]);
    expect(defs.resolve(LINUX).cp).toBe('second');
  });

  it('platform-specific entry overrides unconditional one', () => {
    const defs = new ValDefs([
      ['sep', new ValDef(':', Ruleset.empty())],
      ['sep', new ValDef(';', Ruleset.allowOs('windows'))],
    ]);
    expect(defs.resolve(WINDOWS).sep).toBe(';');
    expect(defs.resolve(LINUX).sep).toBe(':');
  });

  it('entry whose rules do not satisfy is omitted', () => {
    const defs = new ValDefs([
      ['win_only', new ValDef('yes', Ruleset.allowOs('windows'))],
    ]);
    expect(defs.resolve(LINUX).win_only).toBeUndefined();
  });

  it('empty ValDefs resolves to empty object', () => {
    expect(ValDefs.empty().resolve(LINUX)).toEqual({});
  });

  it('ValDef with empty string value is preserved', () => {
    const defs = new ValDefs([['k', new ValDef('', Ruleset.empty())]]);
    expect(defs.resolve(LINUX).k).toBe('');
  });
});

describe('ValDefs.concat', () => {
  it('concat with empty is identity', () => {
    const defs = new ValDefs([['a', new ValDef('1', Ruleset.empty())]]);
    expect(defs.concat(ValDefs.empty()).length).toBe(1);
    expect(ValDefs.empty().concat(defs).length).toBe(1);
  });

  it('later entries from other shadow earlier on same key', () => {
    const a = new ValDefs([['k', new ValDef('a', Ruleset.empty())]]);
    const b = new ValDefs([['k', new ValDef('b', Ruleset.empty())]]);
    expect(a.concat(b).resolve(LINUX).k).toBe('b');
  });
});

describe('ValDefs.empty', () => {
  it('has length 0', () => {
    expect(ValDefs.empty().length).toBe(0);
  });

  it('iterator yields nothing', () => {
    expect([...ValDefs.empty()]).toHaveLength(0);
  });
});

describe('ValDef.CODEC', () => {
  it('string form decodes to unconditional ValDef', () => {
    const def = ValDef.CODEC.decode('hello');
    expect(def.value).toBe('hello');
    expect(def.rules.length).toBe(0);
  });

  it('unconditional ValDef encodes to plain string', () => {
    const def = new ValDef('hello', Ruleset.empty());
    expect(ValDef.CODEC.encode(def)).toBe('hello');
  });

  it('conditional ValDef encodes to object with rules', () => {
    const def = new ValDef('val', Ruleset.allowOs('linux'));
    const encoded = ValDef.CODEC.encode(def);
    expect(typeof encoded).toBe('object');
  });
});
