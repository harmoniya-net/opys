//! One entry of a list: where its file is. No request is made here.

use std::fmt;

use serde::de::{self, MapAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};

use crate::error::ResourcesError;

/// A GitHub release asset.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitHubAsset {
    /// `owner/name`.
    pub repo: String,
    pub tag: String,
    /// The asset's name. Left out where the release has one asset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset: Option<String>,
}

/// A file in a GitLab generic package registry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitLabFile {
    /// Project path (`group/name`) or numeric id.
    pub project: String,
    pub package: String,
    pub version: String,
    pub asset: String,
    /// The instance, for a self-hosted one. `None` is gitlab.com.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
}

/// Where an entry's file is.
///
/// Every spelling names exactly one file. A project alone would mean its
/// newest version, and then a file that nobody edited builds a different
/// pack from one day to the next.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EntrySource {
    /// `modrinth:<project>@<version>[#<loader>]`: a project by its slug or
    /// id, one of its versions by number or id, and the loader it is for
    /// where one number is several versions.
    Modrinth {
        project: String,
        version: String,
        loader: Option<String>,
    },
    /// `curseforge:<project>@<file id>`. The id is the whole name; the
    /// project written beside it is held to it.
    CurseForge {
        project: String,
        file_id: u64,
    },
    /// `file:<path>`: a file beside the resources file, or with a trailing
    /// `/` every file of a folder. It travels in the bundle.
    File(String),
    /// A link, read as `links` reads one.
    Url(String),
    GitHub(GitHubAsset),
    GitLab(GitLabFile),
}

/// Read a source written as a string.
pub fn parse_source(text: &str) -> Result<EntrySource, ResourcesError> {
    let bad = || ResourcesError::BadSource(text.to_owned());
    if text.starts_with("https://") || text.starts_with("http://") {
        return Ok(EntrySource::Url(text.to_owned()));
    }
    if let Some(path) = text.strip_prefix("file:") {
        return match path {
            "" | "/" => Err(bad()),
            path => Ok(EntrySource::File(path.to_owned())),
        };
    }
    let (site, rest) = text.split_once(':').ok_or_else(bad)?;
    if !matches!(site, "modrinth" | "curseforge") {
        return Err(bad());
    }
    // The loader is after the last `#`, a version number being free to hold
    // anything else.
    let (named, loader) = match rest.rsplit_once('#') {
        Some((named, loader)) if !loader.is_empty() => (named, Some(loader)),
        Some(_) => return Err(bad()),
        None => (rest, None),
    };
    let (project, version) = match named.split_once('@') {
        Some(("", _)) | None if named.is_empty() || named.starts_with('@') => return Err(bad()),
        Some((project, version)) if !version.is_empty() => (project, version),
        _ => {
            return Err(ResourcesError::NoVersion {
                source_text: format!("{site}:{}", named.trim_end_matches('@')),
            })
        }
    };
    match site {
        "modrinth" => Ok(EntrySource::Modrinth {
            project: project.to_owned(),
            version: version.to_owned(),
            loader: loader.map(str::to_owned),
        }),
        _ if loader.is_some() => Err(ResourcesError::LoaderElsewhere(text.to_owned())),
        _ => match version.parse() {
            Ok(file_id) => Ok(EntrySource::CurseForge {
                project: project.to_owned(),
                file_id,
            }),
            Err(_) => Err(ResourcesError::BadFileId {
                source_text: text.to_owned(),
                id: version.to_owned(),
            }),
        },
    }
}

impl EntrySource {
    /// The source as a string, where it has one: GitHub and GitLab are
    /// written as fields.
    fn text(&self) -> Option<String> {
        match self {
            EntrySource::Modrinth {
                project,
                version,
                loader,
            } => Some(match loader {
                Some(loader) => format!("modrinth:{project}@{version}#{loader}"),
                None => format!("modrinth:{project}@{version}"),
            }),
            EntrySource::CurseForge { project, file_id } => {
                Some(format!("curseforge:{project}@{file_id}"))
            }
            EntrySource::File(path) => Some(format!("file:{path}")),
            EntrySource::Url(url) => Some(url.clone()),
            EntrySource::GitHub(_) | EntrySource::GitLab(_) => None,
        }
    }
}

/// An entry of a list, under the name its file is installed by.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "EntryWire", into = "EntryWire")]
pub struct Entry {
    pub source: EntrySource,
    /// Free data, copied onto the artifact for whoever reads the manifest.
    /// Nothing here reads it.
    pub metadata: Option<Map<String, Value>>,
}

/// An entry written out. A field it does not know is left alone and not
/// refused, so that a file can carry what another tool reads.
#[derive(Debug, Default, Serialize, Deserialize)]
pub(crate) struct EntryTable {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    github: Option<GitHubAsset>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    gitlab: Option<GitLabFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    metadata: Option<Map<String, Value>>,
}

/// An entry as it is written: its source alone, or a table.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub(crate) enum EntryWire {
    Source(String),
    Table(Box<EntryTable>),
}

// Written out, and not derived as an untagged enum, so that what is wrong
// inside a table is said, and not only that nothing matched.
impl<'de> Deserialize<'de> for EntryWire {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Either;

        impl<'de> Visitor<'de> for Either {
            type Value = EntryWire;

            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a source, as `\"modrinth:<project>@<version>\"`, or a table")
            }

            fn visit_str<E: de::Error>(self, source: &str) -> Result<EntryWire, E> {
                Ok(EntryWire::Source(source.to_owned()))
            }

            fn visit_map<A: MapAccess<'de>>(self, map: A) -> Result<EntryWire, A::Error> {
                EntryTable::deserialize(de::value::MapAccessDeserializer::new(map))
                    .map(|table| EntryWire::Table(Box::new(table)))
            }
        }

        deserializer.deserialize_any(Either)
    }
}

impl TryFrom<EntryWire> for Entry {
    type Error = ResourcesError;

    fn try_from(wire: EntryWire) -> Result<Self, Self::Error> {
        let table = match wire {
            EntryWire::Source(source) => {
                return Ok(Entry {
                    source: parse_source(&source)?,
                    metadata: None,
                })
            }
            EntryWire::Table(table) => *table,
        };
        let source = match (table.source, table.github, table.gitlab) {
            (Some(source), None, None) => parse_source(&source)?,
            (None, Some(github), None) => EntrySource::GitHub(github),
            (None, None, Some(gitlab)) => EntrySource::GitLab(gitlab),
            (None, None, None) => return Err(ResourcesError::OneSource("none")),
            _ => return Err(ResourcesError::OneSource("more than one")),
        };
        Ok(Entry {
            source,
            metadata: table.metadata,
        })
    }
}

impl From<Entry> for EntryWire {
    fn from(entry: Entry) -> Self {
        let source = entry.source.text();
        if let (Some(source), None) = (&source, &entry.metadata) {
            return EntryWire::Source(source.clone());
        }
        let (github, gitlab) = match entry.source {
            EntrySource::GitHub(github) => (Some(github), None),
            EntrySource::GitLab(gitlab) => (None, Some(gitlab)),
            _ => (None, None),
        };
        EntryWire::Table(Box::new(EntryTable {
            source,
            github,
            gitlab,
            metadata: entry.metadata,
        }))
    }
}
