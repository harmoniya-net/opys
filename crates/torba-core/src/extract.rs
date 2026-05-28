use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractPick {
    pub file: String,
    pub into: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractScan {
    pub matches: String,
    pub into: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strip: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub includes: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub excludes: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractDump {
    pub into: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clean: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub includes: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub excludes: Option<Vec<String>>,
}

/// A single extract rule, discriminated structurally on the wire (which
/// field is present: `file` → Pick, `matches` → Scan, otherwise Dump).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ExtractRule {
    Pick(ExtractPick),
    Scan(ExtractScan),
    Dump(ExtractDump),
}

/// Wire form: one rule or many. Decoding flattens both into `Vec<ExtractRule>`;
/// encoding emits the bare object when the list has exactly one entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ExtractWire {
    One(ExtractRule),
    Many(Vec<ExtractRule>),
}

pub fn decode_extract(raw: ExtractWire) -> Vec<ExtractRule> {
    match raw {
        ExtractWire::One(r) => vec![r],
        ExtractWire::Many(v) => v,
    }
}

pub fn encode_extract(rules: &[ExtractRule]) -> ExtractWire {
    if rules.len() == 1 {
        ExtractWire::One(rules[0].clone())
    } else {
        ExtractWire::Many(rules.to_vec())
    }
}
