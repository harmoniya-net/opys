use crate::os::{OsName, OsOptions, RuleError};
use crate::rule::{satisfies_rule, Rule, RuleAction};

pub type Ruleset = Vec<Rule>;

pub fn satisfies_ruleset(
    ruleset: &Ruleset,
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

pub fn empty_ruleset() -> Ruleset {
    Vec::new()
}

pub fn allow_os_ruleset(name: OsName) -> Ruleset {
    vec![Rule::Os {
        action: RuleAction::Allow,
        os: crate::os::OsConstraint {
            name: Some(name),
            ..Default::default()
        },
    }]
}
