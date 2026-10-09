//! What a plugin hands back to the engine.

use std::collections::HashMap;

use opys_bundle::{blob_id, blob_id_of, BlobSource, Blobs};
use opys_core::{encode_short_ruleset, Artifact, MojangRuleset, Source, Val, ValDefs, Valset};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// An artifact as a plugin hands it over: a manifest's own, except that its
/// `source` may also say where the bytes are on this machine — `{ file }`,
/// or `{ bytes }` a plugin made.
///
/// A manifest cannot say either, so neither outlives the build: [`resolve`]
/// reads the bytes, and what comes back is an [`Artifact`] that names them
/// as a blob, with the bytes beside it for whoever writes the bundle. There
/// is no table for a plugin to keep and no id for it to compute.
///
/// Everything but the source is kept as written and decoded by the
/// manifest's own reader when the artifact is resolved, so a build-time
/// artifact has no second spelling of `rules`, `extract` or anything else.
///
/// [`resolve`]: BuildArtifact::resolve
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "Map<String, Value>", into = "Map<String, Value>")]
pub struct BuildArtifact {
    /// Every field but `source`, as written.
    fields: Map<String, Value>,
    source: BuildSource,
}

/// Where a build-time artifact's bytes are.
#[derive(Debug, Clone, PartialEq, Eq)]
enum BuildSource {
    /// As a manifest says it: a `url`, or a blob already named.
    Named(Source),
    /// On this machine, to be carried in the bundle.
    Carried(BlobSource),
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum BuildArtifactError {
    #[error("an artifact has no `source`")]
    NoSource,
    #[error(
        "an artifact's source is `{{ url }}`, `{{ blob }}`, `{{ file }}` or `{{ bytes }}`: {0}"
    )]
    Source(String),
    #[error("cannot read {path}: {reason}")]
    File { path: String, reason: String },
    #[error("{0}")]
    Artifact(String),
}

impl TryFrom<Map<String, Value>> for BuildArtifact {
    type Error = BuildArtifactError;

    fn try_from(mut fields: Map<String, Value>) -> Result<Self, Self::Error> {
        let source = fields
            .remove("source")
            .ok_or(BuildArtifactError::NoSource)?;
        let carried = source
            .as_object()
            .is_some_and(|s| s.contains_key("file") || s.contains_key("bytes"));
        let wrong = |e: serde_json::Error| BuildArtifactError::Source(e.to_string());
        let source = if carried {
            BuildSource::Carried(serde_json::from_value(source).map_err(wrong)?)
        } else {
            BuildSource::Named(serde_json::from_value(source).map_err(wrong)?)
        };
        Ok(BuildArtifact { fields, source })
    }
}

impl From<BuildArtifact> for Map<String, Value> {
    fn from(artifact: BuildArtifact) -> Self {
        let source = match &artifact.source {
            BuildSource::Named(source) => serde_json::to_value(source),
            BuildSource::Carried(source) => serde_json::to_value(source),
        };
        let mut fields = artifact.fields;
        // Both are maps of strings, which always serialise.
        fields.insert("source".to_owned(), source.unwrap_or(Value::Null));
        fields
    }
}

impl From<Artifact> for BuildArtifact {
    fn from(artifact: Artifact) -> Self {
        let source = artifact.source.clone();
        let mut fields = match serde_json::to_value(artifact) {
            Ok(Value::Object(fields)) => fields,
            // An artifact serialises as an object, always.
            _ => Map::new(),
        };
        fields.remove("source");
        BuildArtifact {
            fields,
            source: BuildSource::Named(source),
        }
    }
}

impl BuildArtifact {
    fn carried_at(path: &str, source: BlobSource) -> Self {
        let mut fields = Map::new();
        fields.insert("path".to_owned(), Value::String(path.to_owned()));
        BuildArtifact {
            fields,
            source: BuildSource::Carried(source),
        }
    }

    /// A file on this machine, installed at `path`.
    pub fn file(path: &str, file: impl Into<std::path::PathBuf>) -> Self {
        Self::carried_at(path, BlobSource::File(file.into()))
    }

    /// Bytes a plugin made, installed at `path`.
    pub fn bytes(path: &str, bytes: Vec<u8>) -> Self {
        Self::carried_at(path, BlobSource::Bytes(bytes))
    }

    /// The same artifact, installed only where `rules` pass.
    pub fn with_rules(mut self, rules: &MojangRuleset) -> Self {
        if !rules.is_empty() {
            // The spelling a manifest's own artifact is written in.
            if let Ok(rules) = serde_json::to_value(encode_short_ruleset(rules)) {
                self.fields.insert("rules".to_owned(), rules);
            }
        }
        self
    }

    /// Where it is installed, as written.
    pub fn path(&self) -> Option<&str> {
        self.fields.get("path").and_then(Value::as_str)
    }

    /// Artifacts that name blobs, with the bytes of each put back on the
    /// artifact itself. For a producer that has already hashed what it
    /// carries and holds the two apart.
    pub fn carrying(artifacts: Vec<Artifact>, blobs: &Blobs) -> Vec<BuildArtifact> {
        artifacts
            .into_iter()
            .map(|artifact| {
                let held = artifact.blob_id().and_then(|id| blobs.get(id)).cloned();
                let mut built = BuildArtifact::from(artifact);
                if let Some(source) = held {
                    built.source = BuildSource::Carried(source);
                }
                built
            })
            .collect()
    }

    /// The manifest's artifact, and — for one that is carried — the id of
    /// its blob and where the bytes are. The one impure step: a file is read
    /// to be named by its content.
    pub fn resolve(self) -> Result<(Artifact, Option<(String, BlobSource)>), BuildArtifactError> {
        let mut fields = self.fields;
        let (source, held) = match self.source {
            BuildSource::Named(source) => (source, None),
            BuildSource::Carried(carried) => {
                let (id, size) = match &carried {
                    BlobSource::Bytes(bytes) => (blob_id(bytes), bytes.len() as u64),
                    BlobSource::File(path) => {
                        let read = |e: std::io::Error| BuildArtifactError::File {
                            path: path.display().to_string(),
                            reason: e.to_string(),
                        };
                        blob_id_of(std::fs::File::open(path).map_err(read)?).map_err(read)?
                    }
                };
                // The length that was hashed, whatever was written.
                fields.insert("size".to_owned(), Value::from(size));
                (Source::Blob { blob: id.clone() }, Some((id, carried)))
            }
        };
        let source = serde_json::to_value(source)
            .map_err(|e| BuildArtifactError::Artifact(e.to_string()))?;
        fields.insert("source".to_owned(), source);
        let artifact = serde_json::from_value(Value::Object(fields))
            .map_err(|e| BuildArtifactError::Artifact(e.to_string()))?;
        Ok((artifact, held))
    }
}

/// One named launch fragment a plugin exposes — `jvmArgs` (a `Valset`),
/// `mainClass` (a `Val`), `bin` (a bare string). A config names one on its
/// launch line as `@plugin.group`, and [`crate::assemble`] puts it there.
///
/// Untagged on the wire, and the order matters: a bare string is matched
/// before `One`, whose own bare-string form would otherwise swallow it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LaunchFragment {
    Text(String),
    One(Val),
    Many(Valset),
}

/// A plugin's named launch fragments, looked up by name and never iterated
/// for output — hence an unordered map.
pub type LaunchGroups = HashMap<String, LaunchFragment>;

/// A plugin's build output. Every field is optional in spirit; an empty
/// default contributes nothing.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Contribution {
    /// Artifacts to download/copy/extract. One whose bytes are on this
    /// machine says so in its own `source`.
    pub artifacts: Vec<BuildArtifact>,
    /// Manifest vars this plugin owns.
    pub vars: ValDefs,
    /// Named launch fragments, which a config references by name.
    pub launch: LaunchGroups,
    /// Launch environment variables this plugin sets by default.
    pub envs: ValDefs,
}

/// One plugin's output, tagged with the plugin that produced it. The name is
/// what collision warnings point at, so it travels with the contribution
/// rather than being recovered from a parallel list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginOutput {
    pub name: String,
    #[serde(default)]
    pub contribution: Contribution,
}
