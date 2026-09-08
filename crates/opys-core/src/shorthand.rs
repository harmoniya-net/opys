//! The opys spelling of a rule, and its codec to and from the Mojang one.
//!
//! [`Rule`] is what a rule looks like *in an opys manifest*: a shorthand
//! string such as `"allow.os.linux@10\\."`, or the expanded Mojang object.
//! Both are first-class — a manifest is not obliged to pick one, and neither
//! spelling is a transitional form. [`MojangRule`] is what either expands to,
//! and the only thing the evaluator sees.

use opys_mojang_rules::{MojangRule, MojangRuleset, OsArch, OsConstraint, OsName, RuleAction};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ShorthandError {
    #[error("Unknown action '{0}'")]
    UnknownAction(String),
    #[error("missing OS name")]
    MissingOsName,
    #[error("missing feature name")]
    MissingFeature,
    #[error("missing arch")]
    MissingArch,
    #[error("unknown rule type '{0}'")]
    UnknownRuleType(String),
    #[error("invalid os name '{0}'")]
    InvalidOsName(String),
    #[error("invalid arch '{0}'")]
    InvalidArch(String),
}

/// One rule as written in a manifest: a shorthand string, or the expanded
/// Mojang object.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Rule {
    Short(String),
    Expanded(MojangRule),
}

/// A ruleset as written in a manifest: one rule, or an array of them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Ruleset {
    One(Rule),
    Many(Vec<Rule>),
}

fn parse_os_name(s: &str) -> Result<OsName, ShorthandError> {
    match s {
        "linux" => Ok(OsName::Linux),
        "windows" => Ok(OsName::Windows),
        "osx" => Ok(OsName::Osx),
        _ => Err(ShorthandError::InvalidOsName(s.to_owned())),
    }
}

fn parse_arch(s: &str) -> Result<OsArch, ShorthandError> {
    match s {
        "x86" => Ok(OsArch::X86),
        "x86_64" => Ok(OsArch::X86_64),
        "arm" => Ok(OsArch::Arm),
        "aarch64" => Ok(OsArch::Aarch64),
        "any" => Ok(OsArch::Any),
        _ => Err(ShorthandError::InvalidArch(s.to_owned())),
    }
}

pub fn parse_short_rule(raw: Rule) -> Result<MojangRule, ShorthandError> {
    let s = match raw {
        Rule::Expanded(r) => return Ok(r),
        Rule::Short(s) => s,
    };

    let mut parts = s.splitn(3, '.');
    let action_str = parts.next().unwrap_or("");
    let action = match action_str {
        "allow" => RuleAction::Allow,
        "disallow" => RuleAction::Disallow,
        other => return Err(ShorthandError::UnknownAction(other.to_owned())),
    };
    let type_part = parts.next();
    let rest = parts.next().unwrap_or("");

    let Some(typ) = type_part else {
        return Ok(MojangRule::Plain { action });
    };

    match typ {
        "os" => {
            if rest.is_empty() {
                return Err(ShorthandError::MissingOsName);
            }
            let (name_part, version) = match rest.find('@') {
                Some(i) => (&rest[..i], Some(rest[i + 1..].to_owned())),
                None => (rest, None),
            };
            let name = parse_os_name(name_part)?;
            Ok(MojangRule::Os {
                action,
                os: OsConstraint {
                    name: Some(name),
                    version,
                    arch: None,
                },
            })
        }
        "features" => {
            if rest.is_empty() {
                return Err(ShorthandError::MissingFeature);
            }
            let mut m = BTreeMap::new();
            m.insert(rest.to_owned(), true);
            Ok(MojangRule::Features {
                action,
                features: m,
            })
        }
        "arch" => {
            if rest.is_empty() {
                return Err(ShorthandError::MissingArch);
            }
            Ok(MojangRule::Os {
                action,
                os: OsConstraint {
                    name: None,
                    version: None,
                    arch: Some(parse_arch(rest)?),
                },
            })
        }
        other => Err(ShorthandError::UnknownRuleType(other.to_owned())),
    }
}

fn os_name_str(n: OsName) -> &'static str {
    match n {
        OsName::Linux => "linux",
        OsName::Windows => "windows",
        OsName::Osx => "osx",
    }
}

fn arch_str(a: OsArch) -> &'static str {
    match a {
        OsArch::X86 => "x86",
        OsArch::X86_64 => "x86_64",
        OsArch::Arm => "arm",
        OsArch::Aarch64 => "aarch64",
        OsArch::Any => "any",
    }
}

pub fn encode_short_rule(rule: &MojangRule) -> Rule {
    let action = match rule.action() {
        RuleAction::Allow => "allow",
        RuleAction::Disallow => "disallow",
    };
    match rule {
        MojangRule::Os { os, .. } => {
            if let Some(name) = os.name {
                if let Some(ver) = &os.version {
                    return Rule::Short(format!("{action}.os.{}@{ver}", os_name_str(name)));
                }
                return Rule::Short(format!("{action}.os.{}", os_name_str(name)));
            }
            if let Some(arch) = os.arch {
                return Rule::Short(format!("{action}.arch.{}", arch_str(arch)));
            }
            Rule::Expanded(rule.clone())
        }
        MojangRule::Features { features, .. } => {
            if features.len() == 1 {
                let (k, _) = features.iter().next().unwrap();
                return Rule::Short(format!("{action}.features.{k}"));
            }
            Rule::Expanded(rule.clone())
        }
        MojangRule::Plain { .. } => Rule::Short(action.to_owned()),
    }
}

pub fn parse_short_ruleset(raw: Ruleset) -> Result<MojangRuleset, ShorthandError> {
    let arr = match raw {
        Ruleset::Many(v) => v,
        Ruleset::One(s) => vec![s],
    };
    arr.into_iter().map(parse_short_rule).collect()
}

pub fn encode_short_ruleset(ruleset: &MojangRuleset) -> Ruleset {
    let encoded: Vec<Rule> = ruleset.iter().map(encode_short_rule).collect();
    if encoded.len() == 1 {
        Ruleset::One(encoded.into_iter().next().unwrap())
    } else {
        Ruleset::Many(encoded)
    }
}
