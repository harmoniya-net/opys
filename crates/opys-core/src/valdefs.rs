use indexmap::IndexMap;
use opys_mojang_rules::{satisfies_ruleset, MojangRuleset, OsOptions, RuleError};
use serde::{Deserialize, Serialize};

use crate::shorthand::{encode_short_ruleset, parse_short_ruleset, Ruleset, ShorthandError};

/// One arm of a rule-gated var: a value and the rules that select it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "ConditionalValWire", into = "ConditionalValWire")]
pub struct ConditionalVal {
    pub value: String,
    pub rules: MojangRuleset,
}

impl TryFrom<ConditionalValWire> for ConditionalVal {
    type Error = ShorthandError;

    fn try_from(raw: ConditionalValWire) -> Result<Self, Self::Error> {
        Ok(ConditionalVal {
            value: raw.value,
            rules: raw
                .rules
                .map(parse_short_ruleset)
                .transpose()?
                .unwrap_or_default(),
        })
    }
}

impl From<ConditionalVal> for ConditionalValWire {
    /// Unlike `Val`, an arm drops `rules` entirely when empty.
    fn from(arm: ConditionalVal) -> Self {
        ConditionalValWire {
            value: arm.value,
            rules: (!arm.rules.is_empty()).then(|| encode_short_ruleset(&arm.rules)),
        }
    }
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
    rules: Option<Ruleset>,
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
                    .map(ConditionalVal::try_from)
                    .collect::<Result<_, ShorthandError>>()?,
            ),
        })
    }
}

impl From<ValDef> for ValDefWire {
    fn from(def: ValDef) -> Self {
        match def {
            ValDef::Flat(s) => ValDefWire::Flat(s),
            ValDef::Arms(arms) => {
                ValDefWire::Arms(arms.into_iter().map(ConditionalValWire::from).collect())
            }
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
