/**
 * Feature constraint: `{ feature_name: required_value }`. A feature is
 * satisfied iff its presence in the active set matches the required bool.
 */
export type FeatureConstraint = Record<string, boolean>;
