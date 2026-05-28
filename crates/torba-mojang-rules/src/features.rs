use std::collections::BTreeMap;

/// Feature constraint: `{ feature_name: required_value }`. A feature is
/// "satisfied" iff its presence in the active set matches the required bool.
pub type FeatureConstraint = BTreeMap<String, bool>;

pub fn satisfies_features(constraint: &FeatureConstraint, feats: &[String]) -> bool {
    constraint
        .iter()
        .all(|(feature, &should)| feats.iter().any(|f| f == feature) == should)
}
