use indexmap::IndexMap;
use opys_mojang_rules::{satisfies_ruleset, OsOptions, RuleError, Ruleset};
use serde::{Deserialize, Serialize};

use crate::shorthand::{encode_short_ruleset, parse_short_ruleset, RawRuleset, ShorthandError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConditionalVal {
    pub value: String,
    pub rules: Ruleset,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "ValDefWire", into = "ValDefWire")]
pub enum ValDef {
    Flat(String),
    Arms(Vec<ConditionalVal>),
}

pub type ValDefs = IndexMap<String, ValDef>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ConditionalValWire {
    value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    rules: Option<RawRuleset>,
}

/// The arms are carried as wire structs rather than `Vec<ConditionalVal>`:
/// serde discards the inner error of an untagged variant, so converting the
/// arms explicitly is what keeps a bad shorthand reported as
/// `Unknown action '…'` instead of "data did not match any variant".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum ValDefWire {
    Flat(String),
    Arms(Vec<ConditionalValWire>),
}

impl TryFrom<ValDefWire> for ValDef {
    type Error = ShorthandError;

    fn try_from(raw: ValDefWire) -> Result<Self, Self::Error> {
        Ok(match raw {
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
        })
    }
}

impl From<ValDef> for ValDefWire {
    /// Unlike `Val`, an arm drops `rules` entirely when empty.
    fn from(def: ValDef) -> Self {
        match def {
            ValDef::Flat(s) => ValDefWire::Flat(s),
            ValDef::Arms(arms) => ValDefWire::Arms(
                arms.into_iter()
                    .map(|arm| ConditionalValWire {
                        value: arm.value,
                        rules: (!arm.rules.is_empty()).then(|| encode_short_ruleset(&arm.rules)),
                    })
                    .collect(),
            ),
        }
    }
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
