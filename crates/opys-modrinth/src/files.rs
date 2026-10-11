//! Mod files, by Modrinth version.

use std::collections::HashMap;

use opys_core::{Artifact, HashEntry, Integrity, Source};
use opys_dev::http::get_json;
use opys_dev::url::encode_uri_component;
use serde::{Deserialize, Serialize};

use crate::error::ModrinthError;
use crate::reference::parse_version_ref;

/// How many ids one `/versions` request carries.
const VERSIONS_BATCH_SIZE: usize = 100;

/// One version's file, with everything a caller needs to decide where it goes
/// and everything an artifact needs to fetch it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthFile {
    /// Filename as published, e.g. `sodium-fabric-0.5.8.jar`.
    pub filename: String,
    /// Modrinth version id (base62).
    pub version_id: String,
    /// Modrinth project id (base62).
    pub project_id: String,
    /// Human version string, e.g. `mc1.20.1-0.5.8`.
    pub version_number: String,
    /// File size in bytes.
    pub size: u64,
    /// Public CDN link.
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha1: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct VersionWire {
    id: String,
    project_id: String,
    version_number: String,
    #[serde(default)]
    loaders: Vec<String>,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    files: Vec<VersionFileWire>,
}

impl VersionWire {
    /// The file a version stands for: its primary one, or its first if none
    /// is marked.
    fn file(&self) -> Result<ModrinthFile, ModrinthError> {
        let file = self
            .files
            .iter()
            .find(|f| f.primary)
            .or_else(|| self.files.first())
            .ok_or_else(|| ModrinthError::NoFiles(self.id.clone()))?;
        Ok(ModrinthFile {
            filename: file.filename.clone(),
            version_id: self.id.clone(),
            project_id: self.project_id.clone(),
            version_number: self.version_number.clone(),
            size: file.size,
            url: file.url.clone(),
            sha1: file.hashes.sha1.clone(),
        })
    }
}

#[derive(Deserialize)]
pub(crate) struct VersionFileWire {
    #[serde(default)]
    hashes: HashesWire,
    url: String,
    filename: String,
    #[serde(default)]
    primary: bool,
    size: u64,
}

#[derive(Default, Deserialize)]
pub(crate) struct HashesWire {
    #[serde(default)]
    sha1: Option<String>,
}

/// Resolve version references to one file each, in the order given.
///
/// A version contributes its primary file, or its first if none is marked.
/// The ids travel a hundred to a request.
pub fn resolve_modrinth_files(
    references: &[String],
    api_base: &str,
) -> Result<Vec<ModrinthFile>, ModrinthError> {
    let ids: Vec<&str> = references
        .iter()
        .map(|reference| parse_version_ref(reference))
        .collect::<Result<_, _>>()?;

    let mut versions: HashMap<String, VersionWire> = HashMap::new();
    for batch in ids.chunks(VERSIONS_BATCH_SIZE) {
        // `ids` is a JSON array in the query string.
        let query = encode_uri_component(&serde_json::json!(batch).to_string());
        let found: Vec<VersionWire> = get_json(&format!("{api_base}/versions?ids={query}"), &[])?;
        versions.extend(found.into_iter().map(|v| (v.id.clone(), v)));
    }

    ids.iter()
        .map(|&id| {
            versions
                .get(id)
                .ok_or_else(|| ModrinthError::UnknownVersion(id.to_owned()))?
                .file()
        })
        .collect()
}

/// One line per version, for an author who has to choose between them.
fn describe(versions: &[&VersionWire]) -> String {
    versions
        .iter()
        .map(|v| {
            format!(
                "{} ({}; {})",
                v.id,
                v.loaders.join(", "),
                v.game_versions.join(", ")
            )
        })
        .collect::<Vec<_>>()
        .join("\n  ")
}

/// Resolve a project's version, named as its author names it, to a file.
///
/// `version` is a version number (`mc1.21.1-0.6.13-fabric`) or a version id.
/// An id is exact. A number is not: a project may publish one number once
/// per loader, and `loader`, as Modrinth names one, says which is meant.
///
/// A loader is a filter and not a hint: a version that is not for it does
/// not match, whether or not its number is its own. Where more than one
/// version is left nothing is picked: they are listed with their ids, which
/// is how one of them is named exactly.
///
/// The project's whole list is asked for, without changelogs, because that
/// is the one answer in which a number shared by two versions can be seen.
pub fn resolve_modrinth_project_file(
    project: &str,
    version: &str,
    loader: Option<&str>,
    api_base: &str,
) -> Result<ModrinthFile, ModrinthError> {
    let listed: Vec<VersionWire> = get_json(
        &format!(
            "{api_base}/project/{}/version?include_changelog=false",
            encode_uri_component(project)
        ),
        &[],
    )?;
    let named: Vec<&VersionWire> = match listed.iter().find(|v| v.id == version) {
        Some(exact) => vec![exact],
        None => listed
            .iter()
            .filter(|v| v.version_number == version)
            .collect(),
    };
    if named.is_empty() {
        return Err(ModrinthError::UnknownProjectVersion {
            project: project.to_owned(),
            version: version.to_owned(),
        });
    }
    let fitting: Vec<&VersionWire> = named
        .iter()
        .copied()
        .filter(|v| loader.map_or(true, |loader| v.loaders.iter().any(|l| l == loader)))
        .collect();
    match (fitting.as_slice(), loader) {
        ([only], _) => only.file(),
        ([], Some(loader)) => Err(ModrinthError::NotForLoader {
            project: project.to_owned(),
            version: version.to_owned(),
            loader: loader.to_owned(),
            candidates: describe(&named),
        }),
        (several, _) => Err(ModrinthError::AmbiguousVersion {
            project: project.to_owned(),
            version: version.to_owned(),
            way: match loader {
                Some(_) => "name one by its id",
                None => "say its loader, or name one by its id",
            },
            candidates: describe(if several.is_empty() { &named } else { several }),
        }),
    }
}

/// Turn resolved files into artifacts, each at the path chosen for it.
///
/// The paths are a second argument rather than a callback because choosing one
/// is the config author's function, which lives on the host; this half is the
/// part every host does the same way.
pub fn file_artifacts(
    files: &[ModrinthFile],
    paths: &[String],
) -> Result<Vec<Artifact>, ModrinthError> {
    if files.len() != paths.len() {
        return Err(ModrinthError::PathCount {
            files: files.len(),
            paths: paths.len(),
        });
    }
    Ok(files
        .iter()
        .zip(paths)
        .map(|(file, path)| Artifact {
            path: path.clone(),
            source: Source::Url {
                url: file.url.clone(),
            },
            size: Some(file.size),
            rules: Vec::new(),
            integrity: file
                .sha1
                .as_ref()
                .map(|sha1| Integrity::One(HashEntry::Sha1 { sha1: sha1.clone() })),
            metadata: None,
            extract: None,
        })
        .collect())
}
