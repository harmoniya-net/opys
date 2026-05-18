import { describe, expect, it } from 'vitest';
import {
  parseArguments,
  mergeArgs,
  LEGACY_JVM_ARGS,
  type Arguments,
} from '../../lib/client/arguments';

describe('parseArguments', () => {
  it('parses legacy minecraftArguments string', () => {
    const args = parseArguments(
      '--username ${auth_player_name} --version ${version_name}',
    );
    expect(args.legacy).toBe(true);
    expect(args.jvm).toEqual(LEGACY_JVM_ARGS);
    expect(args.game).toHaveLength(4);
    expect(args.game[0]).toBe('--username');
  });

  it('parses modern arguments object', () => {
    const raw = {
      game: ['--username', '${auth_player_name}'],
      jvm: ['-Xmx${max_memory}'],
    };
    const args = parseArguments(raw);
    expect(args.legacy).toBe(false);
    expect(args.game).toHaveLength(2);
    expect(args.jvm).toHaveLength(1);
  });

  it('parses conditional argument objects', () => {
    const raw = {
      game: [
        {
          rules: [{ action: 'allow', features: { is_demo_user: true } }],
          value: '--demo',
        },
        '--username',
      ],
      jvm: [],
    };
    const args = parseArguments(raw);
    expect(args.game).toHaveLength(2);
    expect(typeof args.game[0]).toBe('object');
    expect(typeof args.game[1]).toBe('string');
  });

  it('defaults missing game/jvm arrays to empty', () => {
    const args = parseArguments({});
    expect(args.game).toEqual([]);
    expect(args.jvm).toEqual([]);
    expect(args.legacy).toBe(false);
  });
});

describe('mergeArgs', () => {
  const base: Arguments = {
    game: ['--base-game'],
    jvm: ['-Xbase'],
    legacy: false,
  };

  it('concatenates jvm and game from base then patch', () => {
    const patch: Arguments = {
      game: ['--patch-game'],
      jvm: ['-Xpatch'],
      legacy: false,
    };
    const merged = mergeArgs(base, patch);
    expect(merged.game).toEqual(['--base-game', '--patch-game']);
    expect(merged.jvm).toEqual(['-Xbase', '-Xpatch']);
    expect(merged.legacy).toBe(false);
  });

  it('returns the base unchanged when the patch is legacy', () => {
    const legacyPatch: Arguments = {
      game: ['--ignored'],
      jvm: LEGACY_JVM_ARGS,
      legacy: true,
    };
    expect(mergeArgs(base, legacyPatch)).toBe(base);
  });
});
