import { Ruleset } from '@unifest/rules';
import { z } from 'zod';
import { MavenName, MavenNameSchema } from './maven';

export class Artifact {
  constructor(
    public readonly path: string,
    public readonly sha1: string,
    public readonly size: number,
    public readonly url: string,
  ) {}

  public static CODEC = z.codec(
    z.object({
      path: z.string(),
      sha1: z.string(),
      size: z.number(),
      url: z.string(),
    }),
    z.instanceof(Artifact),
    {
      decode: (data) => new Artifact(data.path, data.sha1, data.size, data.url),
      encode: (artifact) => artifact,
    },
  );
}

export class Library {
  constructor(
    public readonly name: MavenName,
    public readonly rules: Ruleset,
    public readonly artifact: Artifact,
    public readonly native: boolean,
  ) {}
}

export class Libraries {
  constructor(private readonly inner: Library[]) {}

  public static CODEC = z.codec(
    z.array(
      z.object({
        downloads: z.object({
          artifact: Artifact.CODEC.optional(),
          classifiers: z.record(z.string(), Artifact.CODEC).default({}),
        }),
        name: MavenNameSchema,
        rules: Ruleset.CODEC.default(Ruleset.empty()),
        natives: z.record(z.string(), z.string()).default({}),
        extract: z.object({ exclude: z.array(z.string()) }).optional(),
      }),
    ),
    z.instanceof(Libraries),
    {
      decode: (raws) => {
        const result: Library[] = [];

        for (const raw of raws) {
          const name = raw.name;

          if (raw.downloads.artifact) {
            result.push(
              new Library(
                name,
                raw.rules,
                raw.downloads.artifact,
                name.isNative(),
              ),
            );
          }

          for (const [osName, classifierKey] of Object.entries(raw.natives)) {
            // FIXME: x86
            const key = classifierKey.replace('{arch}', '64');
            const artifact = raw.downloads.classifiers[key];

            if (artifact) {
              result.push(
                new Library(
                  name,
                  Ruleset.allowOs(osName),
                  artifact,
                  true, // classifiers from `natives` are always native
                ),
              );
            }
          }
        }

        return new Libraries(result);
      },
      encode: (libs) =>
        Array.from(libs).map((lib) => ({
          name: lib.name,
          rules: lib.rules,
          downloads: {
            artifact: lib.artifact,
            classifiers: {},
          },
          natives: {},
          extract: undefined,
        })),
    },
  );

  [Symbol.iterator]() {
    return this.inner[Symbol.iterator]();
  }

  public get length() {
    return this.inner.length;
  }

  public toJSON() {
    return this.inner;
  }
}
