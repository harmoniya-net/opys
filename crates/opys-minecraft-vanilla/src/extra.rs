//! Libraries a config adds to a loader.
//!
//! A version JSON says which libraries a game runs with, and for anything a
//! pack needs beside them there was no place to say it: a jar could be put in
//! a directory, but not on the classpath. So a loader takes `libraries`, each
//! a name and an artifact, as a version JSON pairs them:
//!
//! ```json
//! { "name": "org.example:tool:1.2",
//!   "artifact": { "path": "org/example/tool/1.2/tool-1.2.jar",
//!                 "source": { "url": "https://…/tool-1.2.jar" },
//!                 "integrity": { "sha256": "…" } } }
//! ```
//!
//! The artifact is a manifest's own — the type a config already writes under
//! `manifest.artifacts`, with its `rules`, `integrity` and `extract` — and
//! differs in two places. Its `path` is relative to the library directory,
//! as a version JSON's is, since that is where a library goes. And its
//! `source` may be a `file`: a jar on the author's disk, which a manifest
//! cannot name and which therefore travels in the bundle as a blob.
//!
//! They are folded in exactly as an `inheritsFrom` patch's are: ahead of
//! everything already on the classpath, and in place of a library of the
//! same `group:artifact` rather than in front of it.

use std::fs::File;
use std::path::PathBuf;

use opys_bundle::{blob_id_of, BlobSource, Blobs};
use opys_core::{Artifact, ExtractRule, Integrity, Source, ValDef};
use opys_dev::pin::{pin_url, PinError};
use opys_mojang::MavenCoord;
use opys_mojang_rules::{MojangRuleset, RuleError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::mappers::{classpath_of, native_extract, ClasspathEntry};
use crate::vanilla::MinecraftTemplate;

/// Where a library's jar comes from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "ExtraSourceWire", into = "ExtraSourceWire")]
pub enum ExtraSource {
    /// A link to the jar. With no `integrity` beside it, the jar is pinned
    /// by being downloaded at build time.
    Url(String),
    /// A jar on the build machine, carried in the bundle.
    File(PathBuf),
}

/// Discriminated by which field is present, like every shape here.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ExtraSourceWire {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    file: Option<PathBuf>,
}

impl TryFrom<ExtraSourceWire> for ExtraSource {
    type Error = &'static str;

    fn try_from(raw: ExtraSourceWire) -> Result<Self, Self::Error> {
        match (raw.url, raw.file) {
            (Some(url), None) => Ok(ExtraSource::Url(url)),
            (None, Some(file)) => Ok(ExtraSource::File(file)),
            _ => Err("a library's source is `{ url }` or `{ file }`"),
        }
    }
}

impl From<ExtraSource> for ExtraSourceWire {
    fn from(source: ExtraSource) -> Self {
        match source {
            ExtraSource::Url(url) => ExtraSourceWire {
                url: Some(url),
                file: None,
            },
            ExtraSource::File(file) => ExtraSourceWire {
                url: None,
                file: Some(file),
            },
        }
    }
}

/// One library a config adds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "ExtraLibraryWire", into = "ExtraLibraryWire")]
pub struct ExtraLibrary {
    /// What it is. The `group:artifact` of it is the module it provides, which
    /// decides what it supersedes; nothing is derived from the version.
    pub name: MavenCoord,
    pub source: ExtraSource,
    /// Where it is installed, under the library directory.
    pub path: String,
    pub size: Option<u64>,
    pub rules: MojangRuleset,
    pub integrity: Option<Integrity>,
    pub metadata: Option<Value>,
    pub extract: Option<Vec<ExtractRule>>,
}

#[derive(Debug, thiserror::Error)]
pub enum ExtraLibraryError {
    #[error("library '{0}': the name is not a Maven coordinate, `group:artifact:version`")]
    Name(String),
    #[error("library '{name}': {reason}")]
    Artifact { name: String, reason: String },
    #[error(
        "library '{name}': `path` is where it goes under the library directory, so it is \
         relative and stays inside it: got '{path}'"
    )]
    Path { name: String, path: String },
    #[error("library '{0}': a file is pinned by its own content, so it takes no `integrity`")]
    FileIntegrity(String),
    #[error(
        "libraries '{first}' and '{second}' are both installed at '{path}': artifacts are told \
         apart by path, so one would silently take the other's place"
    )]
    SamePath {
        first: String,
        second: String,
        path: String,
    },
    #[error("library '{name}': {source}")]
    Pin {
        name: String,
        #[source]
        source: PinError,
    },
    #[error("library '{name}': cannot read {path}: {source}")]
    File {
        name: String,
        path: String,
        #[source]
        source: std::io::Error,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ExtraLibraryWire {
    name: String,
    artifact: Map<String, Value>,
}

/// A link that stands in for a source while the rest of an artifact is read
/// or written; see [`TryFrom<ExtraLibraryWire>`].
const NO_SOURCE: &str = "";

impl TryFrom<ExtraLibraryWire> for ExtraLibrary {
    type Error = ExtraLibraryError;

    fn try_from(raw: ExtraLibraryWire) -> Result<Self, Self::Error> {
        let named = || raw.name.clone();
        let bad = |reason: String| ExtraLibraryError::Artifact {
            name: named(),
            reason,
        };
        let name: MavenCoord = raw
            .name
            .parse()
            .map_err(|_| ExtraLibraryError::Name(named()))?;

        let mut fields = raw.artifact;
        let source: ExtraSource = serde_json::from_value(
            fields
                .remove("source")
                .ok_or_else(|| bad("missing field `source`".to_owned()))?,
        )
        .map_err(|e| bad(e.to_string()))?;

        // Everything but the source is a manifest artifact's, and is read by
        // the manifest's own reader: it is the one place the shorthand for
        // rules and for extraction is understood, and a second reader beside
        // it is how two spellings drift. That reader takes a whole artifact,
        // so it is handed one, and the source it was given is not kept.
        fields.insert("source".to_owned(), json!({ "url": NO_SOURCE }));
        let artifact: Artifact =
            serde_json::from_value(Value::Object(fields)).map_err(|e| bad(e.to_string()))?;

        let inside = !artifact.path.is_empty()
            && !artifact.path.starts_with('/')
            && !artifact.path.contains("${")
            && artifact.path.split('/').all(|part| part != "..");
        if !inside {
            return Err(ExtraLibraryError::Path {
                name: named(),
                path: artifact.path,
            });
        }
        if matches!(source, ExtraSource::File(_)) && artifact.integrity.is_some() {
            return Err(ExtraLibraryError::FileIntegrity(named()));
        }

        Ok(ExtraLibrary {
            name,
            source,
            path: artifact.path,
            size: artifact.size,
            rules: artifact.rules,
            integrity: artifact.integrity,
            metadata: artifact.metadata,
            extract: artifact.extract,
        })
    }
}

impl From<ExtraLibrary> for ExtraLibraryWire {
    fn from(library: ExtraLibrary) -> Self {
        // Written by the manifest's own writer, for the reason it is read by
        // its reader; the source is then put in the stand-in's place.
        let written = serde_json::to_value(Artifact {
            path: library.path,
            source: Source::Url {
                url: NO_SOURCE.to_owned(),
            },
            size: library.size,
            rules: library.rules,
            integrity: library.integrity,
            metadata: library.metadata,
            extract: library.extract,
        });
        let mut artifact = match written {
            Ok(Value::Object(fields)) => fields,
            // An artifact is a struct of strings and numbers: it serialises.
            _ => Map::new(),
        };
        artifact.insert(
            "source".to_owned(),
            serde_json::to_value(library.source).unwrap_or(Value::Null),
        );
        ExtraLibraryWire {
            name: library.name.to_string(),
            artifact,
        }
    }
}

/// Libraries with their bytes accounted for: each an artifact and its place
/// on the classpath, and where the blobs among them are kept.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ResolvedLibraries {
    pub entries: Vec<(Artifact, ClasspathEntry)>,
    pub blobs: Blobs,
}

/// Pin every library that is not pinned yet. The one impure step: a link
/// with no integrity is downloaded, and a file is read.
pub fn resolve_libraries(
    libraries: &[ExtraLibrary],
) -> Result<ResolvedLibraries, ExtraLibraryError> {
    // Before anything is fetched: two entries for one module are how an
    // override is spelled per OS, and they have to be two files.
    for (index, library) in libraries.iter().enumerate() {
        if let Some(earlier) = libraries[..index].iter().find(|l| l.path == library.path) {
            return Err(ExtraLibraryError::SamePath {
                first: earlier.name.to_string(),
                second: library.name.to_string(),
                path: library.path.clone(),
            });
        }
    }

    let mut resolved = ResolvedLibraries::default();
    for library in libraries {
        let name = || library.name.to_string();
        let path = format!("${{library_directory}}/{}", library.path);

        let (source, size, integrity) = match &library.source {
            ExtraSource::Url(url) => {
                let source = Source::Url { url: url.clone() };
                match &library.integrity {
                    Some(integrity) => (source, library.size, Some(integrity.clone())),
                    None => {
                        let pin = pin_url(url, &[]).map_err(|source| ExtraLibraryError::Pin {
                            name: name(),
                            source,
                        })?;
                        (source, Some(pin.size), Some(Integrity::sha256(pin.sha256)))
                    }
                }
            }
            ExtraSource::File(file) => {
                let read = |source| ExtraLibraryError::File {
                    name: name(),
                    path: file.display().to_string(),
                    source,
                };
                let (id, size) = blob_id_of(File::open(file).map_err(read)?).map_err(read)?;
                resolved
                    .blobs
                    .insert(id.clone(), BlobSource::File(file.clone()));
                let integrity = Integrity::sha256(id.clone());
                (Source::Blob { blob: id }, Some(size), Some(integrity))
            }
        };

        // A natives bundle is unpacked the way a version's own is, unless the
        // library says how itself.
        let native = library.name.is_native();
        let artifact = Artifact {
            path: path.clone(),
            source,
            size,
            rules: library.rules.clone(),
            integrity,
            metadata: library.metadata.clone(),
            extract: library.extract.clone().or_else(|| native_extract(native)),
        };
        let entry = ClasspathEntry {
            rules: library.rules.clone(),
            artifact_path: path,
            module: (!native)
                .then(|| format!("{}:{}", library.name.group_id, library.name.artifact_id)),
        };
        resolved.entries.push((artifact, entry));
    }
    Ok(resolved)
}

/// The pure half: fold resolved libraries onto a template, the way an
/// `inheritsFrom` patch's are folded onto its base.
pub fn with_libraries(
    template: MinecraftTemplate,
    resolved: ResolvedLibraries,
) -> Result<MinecraftTemplate, RuleError> {
    if resolved.entries.is_empty() {
        return Ok(template);
    }
    let (added, ahead): (Vec<Artifact>, Vec<ClasspathEntry>) = resolved.entries.into_iter().unzip();
    // An added library replaces the version's own outright, rules or no
    // rules. Replacing a library for one OS and keeping the version's for the
    // rest would be two sources of truth for one module; whoever overrides it
    // says what every OS gets, by adding an entry for each.
    let replaced: Vec<&str> = ahead.iter().filter_map(|e| e.module.as_deref()).collect();
    let gone = |e: &ClasspathEntry| e.module.as_deref().is_some_and(|m| replaced.contains(&m));

    // What leaves the classpath leaves the download set with it.
    let dropped: Vec<&str> = template
        .entries
        .iter()
        .filter(|e| gone(e))
        .map(|e| e.artifact_path.as_str())
        .collect();
    let mut artifacts: Vec<Artifact> = template
        .artifacts
        .iter()
        .filter(|a| !dropped.contains(&a.path.as_str()))
        .cloned()
        .collect();
    artifacts.extend(added);

    let entries: Vec<ClasspathEntry> = ahead
        .iter()
        .chain(template.entries.iter().filter(|e| !gone(e)))
        .cloned()
        .collect();
    let classpath = classpath_of(&entries)?;
    let mut vars = template.vars;
    vars.insert("classpath".to_owned(), ValDef::Arms(classpath.clone()));

    let mut blobs = template.blobs;
    blobs.extend(resolved.blobs);

    Ok(MinecraftTemplate {
        artifacts,
        vars,
        classpath,
        entries,
        blobs,
        ..template
    })
}
