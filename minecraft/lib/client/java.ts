import { z } from 'zod';

export class JavaVersion {
  constructor(
    public readonly component: string,
    public readonly majorVersion: number,
  ) {}

  public static CODEC = z.codec(
    z
      .object({ component: z.string(), majorVersion: z.number() })
      .default({ component: 'jre-legacy', majorVersion: 8 }),
    z.instanceof(JavaVersion),
    {
      decode: ({ component, majorVersion }) =>
        new JavaVersion(component, majorVersion),
      encode: (java) => java,
    },
  );
}
