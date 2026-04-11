import { z } from 'zod';

export class AssetObject {
  constructor(
    public readonly hash: string,
    public readonly size: number,
  ) {}

  public static CODEC = z.codec(
    z.object({ hash: z.string(), size: z.number() }),
    z.instanceof(AssetObject),
    {
      decode: ({ hash, size }) => new AssetObject(hash, size),
      encode: ({ hash, size }) => ({ hash, size }),
    },
  );

  public url(): string {
    return `https://resources.download.minecraft.net/${this.hash.substring(0, 2)}/${this.hash}`;
  }

  public path(): string {
    return `${this.hash.substring(0, 2)}/${this.hash}`;
  }
}

export class AssetManifest {
  constructor(public readonly objects: Record<string, AssetObject>) {}

  public static CODEC = z.codec(
    z.object({
      objects: z.record(z.string(), AssetObject.CODEC),
    }),
    z.instanceof(AssetManifest),
    {
      decode: ({ objects }) => new AssetManifest(objects),
      encode: (manifest) => manifest,
    },
  );
}

export class AssetIndex {
  constructor(
    public readonly id: string,
    public readonly sha1: string,
    public readonly size: number,
    public readonly totalSize: number,
    public readonly url: string,
  ) {}

  public static CODEC = z.codec(
    z.object({
      id: z.string(),
      sha1: z.string(),
      size: z.number(),
      totalSize: z.number(),
      url: z.string(),
    }),
    z.instanceof(AssetIndex),
    {
      decode: ({ id, sha1, size, totalSize, url }) =>
        new AssetIndex(id, sha1, size, totalSize, url),
      encode: (index) => index,
    },
  );

  public async fetch(): Promise<z.ZodSafeParseResult<AssetManifest>> {
    const response = await fetch(this.url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch asset manifest ${this.url}, ${response.statusText}`,
      );
    }

    const json = (await response.json()) as AssetManifest;

    return AssetManifest.CODEC.safeDecode(json);
  }
}
