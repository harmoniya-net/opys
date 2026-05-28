use serde::{Deserialize, Serialize};
use torba_mojang_rules::{satisfies_ruleset, OsOptions, RuleError, Ruleset};

use crate::discovery::Discovery;
use crate::extract::{decode_extract, encode_extract, ExtractRule, ExtractWire};
use crate::integrity::Integrity;
use crate::shorthand::{encode_short_ruleset, parse_short_ruleset, RawRuleset, ShorthandError};
use crate::source::{decode_source, encode_source, Source, SourceWire};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Artifact {
    pub path: String,
    pub source: Source,
    pub size: Option<u64>,
    pub rules: Ruleset,
    pub integrity: Option<Integrity>,
    pub discovery: Option<Discovery>,
    pub metadata: Option<serde_json::Value>,
    pub extract: Option<Vec<ExtractRule>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactWire {
    pub path: String,
    pub source: SourceWire,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rules: Option<RawRuleset>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub integrity: Option<Integrity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub discovery: Option<Discovery>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extract: Option<ExtractWire>,
}

pub fn decode_artifact(raw: ArtifactWire) -> Result<Artifact, ShorthandError> {
    Ok(Artifact {
        path: raw.path,
        source: decode_source(raw.source),
        size: raw.size,
        rules: raw.rules.map(parse_short_ruleset).transpose()?.unwrap_or_default(),
        integrity: raw.integrity,
        discovery: raw.discovery,
        metadata: raw.metadata,
        extract: raw.extract.map(decode_extract),
    })
}

pub fn encode_artifact(u: &Artifact) -> ArtifactWire {
    ArtifactWire {
        path: u.path.clone(),
        source: encode_source(&u.source),
        size: u.size,
        rules: (!u.rules.is_empty()).then(|| encode_short_ruleset(&u.rules)),
        integrity: u.integrity.clone().map(Integrity::collapsed),
        discovery: u.discovery.clone(),
        metadata: u.metadata.clone(),
        extract: u.extract.as_deref().map(encode_extract),
    }
}

/// Deduplicate by normalized path — later entries win.
pub fn deduplicate_artifacts(artifacts: Vec<Artifact>) -> Vec<Artifact> {
    use indexmap::IndexMap;
    let mut map: IndexMap<String, Artifact> = IndexMap::new();
    for u in artifacts {
        let norm = normalize_posix(&u.path);
        map.shift_remove(&norm);
        map.insert(norm, u);
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

/// Free-fn alias for `Artifact::applies` — kept until callers migrate.
pub fn artifact_applies(
    u: &Artifact,
    os: &OsOptions,
    feats: &[String],
) -> Result<bool, RuleError> {
    u.applies(os, feats)
}
