use opys_mojang_rules::{satisfies_ruleset, MojangRuleset, OsOptions, RuleError};
use serde::{Deserialize, Serialize};

use crate::extract::{decode_extract, encode_extract, ExtractRule, ExtractWire};
use crate::integrity::{HashEntry, Integrity};
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
    pub metadata: Option<serde_json::Value>,
    pub extract: Option<Vec<ExtractRule>>,
}

/// `source` is the domain `Source`, which carries its own wire conversion —
/// only the fields whose wire shape actually differs are spelled out here.
///
/// Unknown fields are refused rather than dropped. An artifact is where a
/// manifest says how a file is verified, and a key this reader does not know
/// may be exactly that: a manifest written when `discovery` existed carries
/// its only integrity there, and reading past it would install the file
/// unchecked without a word. `metadata` is the place for anything else.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
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
    metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    extract: Option<ExtractWire>,
}

#[derive(Debug, thiserror::Error)]
pub enum ArtifactError {
    #[error(transparent)]
    Rules(#[from] ShorthandError),
    #[error(
        "{path}: a blob is verified by its own name, and this integrity names different bytes"
    )]
    BlobIntegrity { path: String },
}

/// A blob's name is the sha256 of its bytes, so a blob artifact needs no
/// `integrity` of its own — and decoding gives it one anyway, so that nothing
/// downstream has to know a blob from a download to verify it.
fn integrity_of(
    path: &str,
    source: &Source,
    written: Option<Integrity>,
) -> Result<Option<Integrity>, ArtifactError> {
    let Source::Blob { blob } = source else {
        return Ok(written);
    };
    let agrees = written.as_ref().map_or(true, |integrity| {
        integrity
            .entries()
            .iter()
            .any(|entry| matches!(entry, HashEntry::Sha256 { .. }) && entry.hex() == blob)
    });
    if !agrees {
        return Err(ArtifactError::BlobIntegrity {
            path: path.to_owned(),
        });
    }
    Ok(Some(Integrity::sha256(blob.clone())))
}

impl TryFrom<ArtifactWire> for Artifact {
    type Error = ArtifactError;

    fn try_from(raw: ArtifactWire) -> Result<Self, Self::Error> {
        Ok(Artifact {
            integrity: integrity_of(&raw.path, &raw.source, raw.integrity)?,
            path: raw.path,
            source: raw.source,
            size: raw.size,
            rules: raw
                .rules
                .map(parse_short_ruleset)
                .transpose()?
                .unwrap_or_default(),
            metadata: raw.metadata,
            extract: raw.extract.map(decode_extract),
        })
    }
}

impl From<Artifact> for ArtifactWire {
    fn from(u: Artifact) -> Self {
        // The one spelling of a blob artifact has no `integrity`: its source
        // already is one.
        let integrity = match u.source {
            Source::Blob { .. } => None,
            Source::Url { .. } => u.integrity.map(Integrity::collapsed),
        };
        ArtifactWire {
            path: u.path,
            source: u.source,
            size: u.size,
            rules: (!u.rules.is_empty()).then(|| encode_short_ruleset(&u.rules)),
            integrity,
            extract: u.extract.as_deref().map(encode_extract),
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
    /// The artifact that puts the blob `id` at `path`.
    pub fn blob(path: impl Into<String>, id: impl Into<String>, size: u64) -> Self {
        let id = id.into();
        Artifact {
            path: path.into(),
            integrity: Some(Integrity::sha256(id.clone())),
            source: Source::Blob { blob: id },
            size: Some(size),
            rules: MojangRuleset::default(),
            metadata: None,
            extract: None,
        }
    }

    /// The blob this artifact is made of, if it is made of one.
    pub fn blob_id(&self) -> Option<&str> {
        match &self.source {
            Source::Blob { blob } => Some(blob),
            Source::Url { .. } => None,
        }
    }

    /// True if the artifact's ruleset matches the given platform + features.
    pub fn applies(&self, os: &OsOptions, feats: &[String]) -> Result<bool, RuleError> {
        satisfies_ruleset(&self.rules, os, feats)
    }
}
