//! String-form shorthand for rules: `"allow.os.linux@10\\."` ↔ `Rule`.
//!
//! Mirrors `core/lib/shorthand.ts`.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;
use torba_mojang_rules::{OsArch, OsConstraint, OsName, Rule, RuleAction, Ruleset};

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

/// Wire form of a single rule entry: either a shorthand string or an expanded
/// rule object.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RawSingle {
    Short(String),
    Expanded(Rule),
}

/// Wire form of a ruleset: a single entry or an array.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RawRuleset {
    One(RawSingle),
    Many(Vec<RawSingle>),
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

pub fn parse_short_rule(raw: RawSingle) -> Result<Rule, ShorthandError> {
    let s = match raw {
        RawSingle::Expanded(r) => return Ok(r),
        RawSingle::Short(s) => s,
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
        return Ok(Rule::Plain { action });
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
            Ok(Rule::Os {
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
            Ok(Rule::Features {
                action,
                features: m,
            })
        }
        "arch" => {
            if rest.is_empty() {
                return Err(ShorthandError::MissingArch);
            }
            Ok(Rule::Os {
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

pub fn encode_short_rule(rule: &Rule) -> RawSingle {
    let action = match rule.action() {
        RuleAction::Allow => "allow",
        RuleAction::Disallow => "disallow",
    };
    match rule {
        Rule::Os { os, .. } => {
            if let Some(name) = os.name {
                if let Some(ver) = &os.version {
                    return RawSingle::Short(format!(
                        "{action}.os.{}@{ver}",
                        os_name_str(name)
                    ));
                }
                return RawSingle::Short(format!("{action}.os.{}", os_name_str(name)));
            }
            if let Some(arch) = os.arch {
                return RawSingle::Short(format!("{action}.arch.{}", arch_str(arch)));
            }
            RawSingle::Expanded(rule.clone())
        }
        Rule::Features { features, .. } => {
            if features.len() == 1 {
                let (k, _) = features.iter().next().unwrap();
                return RawSingle::Short(format!("{action}.features.{k}"));
            }
            RawSingle::Expanded(rule.clone())
        }
        Rule::Plain { .. } => RawSingle::Short(action.to_owned()),
    }
}

pub fn parse_short_ruleset(raw: RawRuleset) -> Result<Ruleset, ShorthandError> {
    let arr = match raw {
        RawRuleset::Many(v) => v,
        RawRuleset::One(s) => vec![s],
    };
    arr.into_iter().map(parse_short_rule).collect()
}

pub fn encode_short_ruleset(ruleset: &Ruleset) -> RawRuleset {
    let encoded: Vec<RawSingle> = ruleset.iter().map(encode_short_rule).collect();
    if encoded.len() == 1 {
        RawRuleset::One(encoded.into_iter().next().unwrap())
    } else {
        RawRuleset::Many(encoded)
    }
}
