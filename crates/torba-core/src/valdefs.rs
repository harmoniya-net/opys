use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use torba_mojang_rules::{satisfies_ruleset, OsOptions, RuleError, Ruleset};

use crate::shorthand::{encode_short_ruleset, parse_short_ruleset, RawRuleset, ShorthandError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConditionalVal {
    pub value: String,
    pub rules: Ruleset,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValDef {
    Flat(String),
    Arms(Vec<ConditionalVal>),
}

pub type ValDefs = IndexMap<String, ValDef>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionalValWire {
    pub value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rules: Option<RawRuleset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ValDefWire {
    Flat(String),
    Arms(Vec<ConditionalValWire>),
}

pub fn parse_val_defs(raw: IndexMap<String, ValDefWire>) -> Result<ValDefs, ShorthandError> {
    raw.into_iter()
        .map(|(key, val)| {
            let parsed = match val {
                ValDefWire::Flat(s) => ValDef::Flat(s),
                ValDefWire::Arms(arms) => ValDef::Arms(
                    arms.into_iter()
                        .map(|arm| {
                            Ok(ConditionalVal {
                                value: arm.value,
                                rules: arm
                                    .rules
                                    .map(parse_short_ruleset)
                                    .transpose()?
                                    .unwrap_or_default(),
                            })
                        })
                        .collect::<Result<_, ShorthandError>>()?,
                ),
            };
            Ok((key, parsed))
        })
        .collect()
}

pub fn encode_val_defs(defs: &ValDefs) -> serde_json::Value {
    let mut out = serde_json::Map::new();
    for (key, val) in defs {
        let v = match val {
            ValDef::Flat(s) => serde_json::Value::String(s.clone()),
            ValDef::Arms(arms) => serde_json::Value::Array(
                arms.iter()
                    .map(|arm| {
                        let mut m = serde_json::Map::new();
                        m.insert("value".into(), serde_json::Value::String(arm.value.clone()));
                        if !arm.rules.is_empty() {
                            m.insert(
                                "rules".into(),
                                serde_json::to_value(encode_short_ruleset(&arm.rules)).unwrap(),
                            );
                        }
                        serde_json::Value::Object(m)
                    })
                    .collect(),
            ),
        };
        out.insert(key.clone(), v);
    }
    serde_json::Value::Object(out)
}

/// For each key: flat → use as-is; arms → last matching arm wins.
pub fn resolve_val_defs(
    defs: &ValDefs,
    os: &OsOptions,
    feats: &[String],
) -> Result<IndexMap<String, String>, RuleError> {
    let mut result = IndexMap::new();
    for (key, val) in defs {
        match val {
            ValDef::Flat(s) => {
                result.insert(key.clone(), s.clone());
            }
            ValDef::Arms(arms) => {
                let mut chosen: Option<String> = None;
                for arm in arms {
                    if satisfies_ruleset(&arm.rules, os, feats)? {
                        chosen = Some(arm.value.clone());
                    }
                }
                if let Some(v) = chosen {
                    result.insert(key.clone(), v);
                }
            }
        }
    }
    Ok(result)
}
