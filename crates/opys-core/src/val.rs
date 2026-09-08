use opys_mojang_rules::{satisfies_ruleset, MojangRuleset, OsOptions, RuleError};
use serde::{Deserialize, Serialize};

use crate::shorthand::{encode_short_ruleset, parse_short_ruleset, Ruleset, ShorthandError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "ValWire", into = "ValWire")]
pub struct Val {
    pub rules: MojangRuleset,
    pub value: Vec<String>,
}

pub type Valset = Vec<Val>;

/// Wire shape: a bare string, or an object with `rules` + `value`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum ValWire {
    Bare(String),
    Object {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        rules: Option<Ruleset>,
        value: ValValueWire,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum ValValueWire {
    One(String),
    Many(Vec<String>),
}

impl TryFrom<ValWire> for Val {
    type Error = ShorthandError;

    fn try_from(raw: ValWire) -> Result<Self, Self::Error> {
        match raw {
            ValWire::Bare(s) => Ok(Val {
                rules: Vec::new(),
                value: vec![s],
            }),
            ValWire::Object { rules, value } => Ok(Val {
                rules: rules
                    .map(parse_short_ruleset)
                    .transpose()?
                    .unwrap_or_default(),
                value: match value {
                    ValValueWire::One(s) => vec![s],
                    ValValueWire::Many(v) => v,
                },
            }),
        }
    }
}

impl From<Val> for ValWire {
    /// A rule-free single value collapses to a bare string; anything else
    /// keeps the object form, `rules` included even when empty.
    fn from(val: Val) -> Self {
        if val.rules.is_empty() && val.value.len() == 1 {
            return ValWire::Bare(val.value.into_iter().next().expect("len checked"));
        }
        ValWire::Object {
            rules: Some(encode_short_ruleset(&val.rules)),
            value: ValValueWire::Many(val.value),
        }
    }
}

pub fn resolve_valset(
    vs: &Valset,
    os: &OsOptions,
    feats: &[String],
) -> Result<Vec<String>, RuleError> {
    let mut acc = Vec::new();
    for val in vs {
        if satisfies_ruleset(&val.rules, os, feats)? {
            acc.extend_from_slice(&val.value);
        }
    }
    Ok(acc)
}
