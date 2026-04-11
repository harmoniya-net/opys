import { Valset } from '@unifest/rules';
import { z } from 'zod';

export const LEGACY_JVM_ARGS = Valset.CODEC.decode([
  '-Djava.library.path=${natives_directory}',
  '-cp',
  '${classpath}',
]);

export class Arguments {
  constructor(
    public readonly game: Valset,
    public readonly jvm: Valset,
    public readonly legacy: boolean,
  ) {}

  public static CODEC = z.codec(
    z.union([z.string(), z.object({ game: Valset.CODEC, jvm: Valset.CODEC })]),
    z.instanceof(Arguments),
    {
      decode: (item) => {
        if (typeof item === 'string') {
          const game = Valset.CODEC.decode(item.split(/\s+/).filter(Boolean));
          return new Arguments(game, LEGACY_JVM_ARGS, true);
        }

        return new Arguments(item.game, item.jvm, false);
      },

      encode: (item) => item.toJSON(),
    },
  );

  public concat(other: Arguments): Arguments {
    if (this.legacy && other.legacy) {
      return new Arguments(
        new Valset([...this.game, ...other.game]),
        LEGACY_JVM_ARGS,
        true,
      );
    }

    if (this.legacy || other.legacy) {
      const legacyOne = this.legacy ? this : other;
      const modernOne = this.legacy ? other : this;

      return new Arguments(
        new Valset([...legacyOne.game, ...modernOne.game]),
        modernOne.jvm,
        false,
      );
    }

    return new Arguments(
      new Valset([...this.game, ...other.game]),
      new Valset([...this.jvm, ...other.jvm]),
      false,
    );
  }

  public toJSON() {
    return this;
  }
}
