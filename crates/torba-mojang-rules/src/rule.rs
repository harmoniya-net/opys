use serde::{Deserialize, Serialize};

use crate::features::{satisfies_features, FeatureConstraint};
use crate::os::{satisfies_os, OsConstraint, OsOptions, RuleError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuleAction {
    Allow,
    Disallow,
}

/// A rule is `{ action }` plus an optional `os` or `features` constraint.
///
/// Order in `untagged` matters: the OS variant checks first, then features,
/// then plain. JSON with extra keys is tolerated (matches the TS `z.object`
/// strip-unknown behavior).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Rule {
    Os {
        action: RuleAction,
        os: OsConstraint,
    },
    Features {
        action: RuleAction,
        features: FeatureConstraint,
    },
    Plain {
        action: RuleAction,
    },
}

impl Rule {
    pub fn action(&self) -> RuleAction {
        match self {
            Rule::Os { action, .. } | Rule::Features { action, .. } | Rule::Plain { action } => {
                *action
            }
        }
    }
}

pub fn satisfies_rule(
    rule: &Rule,
    os: &OsOptions,
    feats: &[String],
) -> Result<bool, RuleError> {
    let allow = matches!(rule.action(), RuleAction::Allow);
    match rule {
        Rule::Os { os: c, .. } => Ok(satisfies_os(c, os)? == allow),
        Rule::Features { features, .. } => Ok(satisfies_features(features, feats) == allow),
        Rule::Plain { .. } => Ok(allow),
    }
}
