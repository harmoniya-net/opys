use opys_mojang_rules::{satisfies_ruleset, MojangRuleset, OsOptions, RuleError};
use serde::{Deserialize, Serialize};

use crate::discovery::Discovery;
use crate::extract::{decode_extract, encode_extract, ExtractRule, ExtractWire};
use crate::integrity::Integrity;
use crate::shorthand::{encode_short_ruleset, parse_short_ruleset, Ruleset, ShorthandError};
use crate::source::Source;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "ArtifactWire", into = "ArtifactWire")]
pub struct Artifact {
    pub path: String,
    pub source: Source,
    pub size: Option<u64>,
    pub rules: MojangRuleset,
    pub integrity: Option<Integrity>,
    pub discovery: Option<Discovery>,
    pub metadata: Option<serde_json::Value>,
    pub extract: Option<Vec<ExtractRule>>,
}

/// `source` is the domain `Source`, which carries its own wire conversion —
/// only the fields whose wire shape actually differs are spelled out here.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ArtifactWire {
    path: String,
    source: Source,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    rules: Option<Ruleset>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    integrity: Option<Integrity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    discovery: Option<Discovery>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    extract: Option<ExtractWire>,
}

impl TryFrom<ArtifactWire> for Artifact {
    type Error = ShorthandError;

    fn try_from(raw: ArtifactWire) -> Result<Self, Self::Error> {
        Ok(Artifact {
            path: raw.path,
            source: raw.source,
            size: raw.size,
            rules: raw
                .rules
                .map(parse_short_ruleset)
                .transpose()?
                .unwrap_or_default(),
            integrity: raw.integrity,
            discovery: raw.discovery,
            metadata: raw.metadata,
            extract: raw.extract.map(decode_extract),
        })
    }
}

impl From<Artifact> for ArtifactWire {
    fn from(u: Artifact) -> Self {
        ArtifactWire {
            path: u.path,
            source: u.source,
            size: u.size,
            rules: (!u.rules.is_empty()).then(|| encode_short_ruleset(&u.rules)),
            integrity: u.integrity.map(Integrity::collapsed),
            extract: u.extract.as_deref().map(encode_extract),
            discovery: u.discovery,
            metadata: u.metadata,
        }
    }
}

/// Deduplicate by normalized path — the later entry's *content* wins, while
/// the path keeps the position of its first appearance. That placement is what
/// `Map.set` gives in JS, and matching it keeps a manifest byte-identical
/// across the two implementations.
pub fn deduplicate_artifacts(artifacts: Vec<Artifact>) -> Vec<Artifact> {
    use indexmap::IndexMap;
    let mut map: IndexMap<String, Artifact> = IndexMap::new();
    for u in artifacts {
        map.insert(normalize_posix(&u.path), u);
    }
    map.into_values().collect()
}

fn normalize_posix(p: &str) -> String {
    // Approximate POSIX `path.normalize` — collapse `./`, `//`, resolve `..`.
    let mut stack: Vec<&str> = Vec::new();
    let leading_slash = p.starts_with('/');
    for part in p.split('/') {
        match part {
            "" | "." => continue,
            ".." => {
                if matches!(stack.last(), Some(&prev) if prev != "..") {
                    stack.pop();
                } else if !leading_slash {
                    stack.push("..");
                }
            }
            other => stack.push(other),
        }
    }
    let joined = stack.join("/");
    if leading_slash {
        format!("/{joined}")
    } else if joined.is_empty() {
        ".".to_owned()
    } else {
        joined
    }
}

impl Artifact {
    /// True if the artifact's ruleset matches the given platform + features.
    pub fn applies(&self, os: &OsOptions, feats: &[String]) -> Result<bool, RuleError> {
        satisfies_ruleset(&self.rules, os, feats)
    }
}
