import { RuleAction } from '@unifest/rules';
import { describe, expect, test } from 'vitest';
import { Arguments, LEGACY_JVM_ARGS } from '../../lib/client/arguments';

describe('Arguments', () => {
  test('decode legacy string', () => {
    const input = '--username ${auth_player_name} --version ${version_name}';
    const args = Arguments.CODEC.decode(input);

    expect(args.legacy).toBe(true);
    const gameArgs = [...args.game].flatMap((v) => v.value);
    expect(gameArgs).toEqual([
      '--username',
      '${auth_player_name}',
      '--version',
      '${version_name}',
    ]);
    expect(args.jvm).toEqual(LEGACY_JVM_ARGS);
  });

  test('decode modern object', () => {
    const input = {
      game: [
        '--username',
        '${auth_player_name}',
        {
          rules: [{ action: RuleAction.Allow, os: { name: 'osx' } }],
          value: '--osx-only',
        },
      ],
      jvm: ['-Xmx1G'],
    };

    const args = Arguments.CODEC.decode(input);
    expect(args.legacy).toBe(false);
    expect(args.game.length).toBe(3);
    expect(args.jvm.length).toBe(1);

    const osxOnlyArg = [...args.game][2];
    expect(osxOnlyArg!.value).toEqual(['--osx-only']);
    expect(osxOnlyArg!.rules.length).toBe(1);
  });

  test('roundtrip modern', () => {
    const input = {
      game: ['--game-arg'],
      jvm: ['-Djvm-prop'],
    };
    const args = Arguments.CODEC.decode(input);
    const encoded = Arguments.CODEC.encode(args);

    expect(encoded).not.toBeInstanceOf(String);
    if (typeof encoded === 'string') throw new Error('Expected object');

    expect(encoded).not.toBe(args);
    expect(encoded.game).toEqual(['--game-arg']);
    expect(encoded.jvm).toEqual(['-Djvm-prop']);
  });

  test('decode empty string', () => {
    const args = Arguments.CODEC.decode('');
    expect(args.game.length).toBe(0);
    expect(args.legacy).toBe(true);
  });
});
