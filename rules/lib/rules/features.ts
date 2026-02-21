import z from 'zod';

export class FeatureMap {
  constructor(private readonly inner: Record<string, boolean>) {}

  public static CODEC = z.codec(
    z.record(z.string(), z.boolean()),
    z.instanceof(FeatureMap),
    {
      decode: (features) => new FeatureMap(features),
      encode: (featureMap) => featureMap.toJSON(),
    },
  );

  public satisfies(feats: string[]): boolean {
    return Object.entries(this.inner).every(
      ([feature, should]) => feats.some((feat) => feat === feature) === should,
    );
  }

  [Symbol.iterator]() {
    return Object.entries(this.inner)[Symbol.iterator]();
  }

  public toJSON() {
    return this.inner;
  }
}
