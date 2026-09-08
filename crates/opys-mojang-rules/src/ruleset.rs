use crate::os::{OsName, OsOptions, RuleError};
use crate::rule::{satisfies_rule, MojangRule, RuleAction};

pub type MojangRuleset = Vec<MojangRule>;

pub fn satisfies_ruleset(
    ruleset: &MojangRuleset,
    os: &OsOptions,
    feats: &[String],
) -> Result<bool, RuleError> {
    for rule in ruleset {
        if !satisfies_rule(rule, os, feats)? {
            return Ok(false);
        }
    }
    Ok(true)
}

pub fn empty_ruleset() -> MojangRuleset {
    Vec::new()
}

pub fn allow_os_ruleset(name: OsName) -> MojangRuleset {
    vec![MojangRule::Os {
        action: RuleAction::Allow,
        os: crate::os::OsConstraint {
            name: Some(name),
            ..Default::default()
        },
    }]
}
