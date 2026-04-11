import { z } from 'zod';

const SourceSchema = z.union([
  z.object({ url: z.string() }),
  z.object({ file: z.string() }),
  z.object({ string: z.string() }),
  z.literal('empty'),
]);

type SourceInner = z.infer<typeof SourceSchema>;

export class Source {
  constructor(private readonly inner: SourceInner) {}

  public static url(url: string): Source {
    return new Source({ url });
  }

  public static file(path: string): Source {
    return new Source({ file: path });
  }

  public static string(content: string): Source {
    return new Source({ string: content });
  }

  public static empty(): Source {
    return new Source('empty');
  }

  public static CODEC = z.codec(SourceSchema, z.instanceof(Source), {
    decode: (val) => new Source(val),
    encode: (source) => source.toJSON(),
  });

  public isUrl(): this['inner'] extends { url: string } ? true : false {
    return (typeof this.inner === 'object' && 'url' in this.inner) as never;
  }

  public isFile(): boolean {
    return typeof this.inner === 'object' && 'file' in this.inner;
  }

  public isString(): boolean {
    return typeof this.inner === 'object' && 'string' in this.inner;
  }

  public isEmpty(): boolean {
    return this.inner === 'empty';
  }

  public url(): string | undefined {
    if (typeof this.inner === 'object' && 'url' in this.inner)
      return this.inner.url;
    return undefined;
  }

  public file(): string | undefined {
    if (typeof this.inner === 'object' && 'file' in this.inner)
      return this.inner.file;
    return undefined;
  }

  public string(): string | undefined {
    if (typeof this.inner === 'object' && 'string' in this.inner)
      return this.inner.string;
    return undefined;
  }

  public toJSON(): SourceInner {
    return this.inner;
  }
}
