import { z } from 'zod';

export type FeatureConstraint = Record<string, boolean>;

export const FeatureConstraintSchema = z.record(z.string(), z.boolean());

export function satisfiesFeatures(
  constraint: FeatureConstraint,
  feats: string[],
): boolean {
  return Object.entries(constraint).every(
    ([feature, should]) => feats.some((f) => f === feature) === should,
  );
}
