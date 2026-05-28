use serde::{Deserialize, Serialize};
use lanka_mojang_rules::{satisfies_ruleset, OsOptions, RuleError, Ruleset};

use crate::shorthand::{encode_short_ruleset, parse_short_ruleset, RawRuleset, ShorthandError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Val {
    pub rules: Ruleset,
    pub value: Vec<String>,
}

/// Wire shape: a bare string, or an object with `rules` + `value`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ValWire {
    Bare(String),
    Object {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        rules: Option<RawRuleset>,
        value: ValValueWire,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ValValueWire {
    One(String),
    Many(Vec<String>),
}

pub fn parse_val(raw: ValWire) -> Result<Val, ShorthandError> {
    match raw {
        ValWire::Bare(s) => Ok(Val {
            rules: Vec::new(),
            value: vec![s],
        }),
        ValWire::Object { rules, value } => Ok(Val {
            rules: match rules {
                Some(r) => parse_short_ruleset(r)?,
                None => Vec::new(),
            },
            value: match value {
                ValValueWire::One(s) => vec![s],
                ValValueWire::Many(v) => v,
            },
        }),
    }
}

pub fn encode_val(val: &Val) -> serde_json::Value {
    if val.rules.is_empty() && val.value.len() == 1 {
        return serde_json::Value::String(val.value[0].clone());
    }
    let mut map = serde_json::Map::new();
    map.insert(
        "rules".into(),
        serde_json::to_value(encode_short_ruleset(&val.rules)).unwrap(),
    );
    map.insert(
        "value".into(),
        serde_json::Value::Array(
            val.value
                .iter()
                .cloned()
                .map(serde_json::Value::String)
                .collect(),
        ),
    );
    serde_json::Value::Object(map)
}

pub type Valset = Vec<Val>;

pub fn parse_valset(raw: Vec<ValWire>) -> Result<Valset, ShorthandError> {
    raw.into_iter().map(parse_val).collect()
}

pub fn encode_valset(vs: &Valset) -> Vec<serde_json::Value> {
    vs.iter().map(encode_val).collect()
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
