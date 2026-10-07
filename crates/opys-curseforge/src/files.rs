//! Mod files, by CurseForge file id.

use std::collections::HashMap;

use opys_core::{Artifact, HashEntry, Integrity, Source};
use opys_dev::http::post_json;
use opys_dev::url::encode_uri_component;
use serde::{Deserialize, Serialize};

use crate::error::CurseForgeError;
use crate::reference::FileRef;

/// How many ids one `/mods/files` request carries.
const FILES_BATCH_SIZE: usize = 200;

/// CurseForge's code for sha1 in a file's `hashes`. (2 is md5.)
const HASH_ALGO_SHA1: u8 = 1;

/// One file, with everything a caller needs to decide where it goes and
/// everything an artifact needs to fetch it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurseForgeFile {
    /// CurseForge file id.
    pub file_id: u64,
    /// CurseForge project (mod) id.
    pub project_id: u64,
    /// Filename as published, e.g. `jei-1.20.1-forge-15.21.1.5.jar`.
    pub filename: String,
    /// File size in bytes.
    pub size: u64,
    /// Where to download it: the API's answer, or the CDN address when it
    /// gave none.
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha1: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct FilesWire {
    data: Vec<FileWire>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileWire {
    id: u64,
    mod_id: u64,
    file_name: String,
    file_length: u64,
    #[serde(default)]
    hashes: Vec<HashWire>,
    #[serde(default)]
    download_url: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct HashWire {
    value: String,
    algo: u8,
}

/// Where a file lives on CurseForge's CDN.
///
/// The API answers `downloadUrl: null` for a file whose author opted out of
/// third-party distribution. The file is on the CDN all the same, under its
/// id split at the thousands.
fn forge_cdn_url(file_id: u64, filename: &str) -> String {
    format!(
        "https://edge.forgecdn.net/files/{}/{}/{}",
        file_id / 1000,
        file_id % 1000,
        encode_uri_component(filename)
    )
}

impl From<FileWire> for CurseForgeFile {
    fn from(wire: FileWire) -> Self {
        CurseForgeFile {
            url: wire
                .download_url
                .unwrap_or_else(|| forge_cdn_url(wire.id, &wire.file_name)),
            sha1: wire
                .hashes
                .into_iter()
                .find(|h| h.algo == HASH_ALGO_SHA1)
                .map(|h| h.value),
            file_id: wire.id,
            project_id: wire.mod_id,
            filename: wire.file_name,
            size: wire.file_length,
        }
    }
}

/// Look files up by id, two hundred to a request.
///
/// The result is in the API's order, not the caller's, and a file the API
/// does not know is simply absent — look one up by `file_id`.
pub fn fetch_curseforge_files(
    token: &str,
    file_ids: &[u64],
    api_base: &str,
) -> Result<Vec<CurseForgeFile>, CurseForgeError> {
    let url = format!("{api_base}/mods/files");
    let headers = [("x-api-key", token), ("accept", "application/json")];

    let mut files = Vec::with_capacity(file_ids.len());
    for batch in file_ids.chunks(FILES_BATCH_SIZE) {
        let response = post_json(&url, &headers, &serde_json::json!({ "fileIds": batch }))?;
        if !response.ok() {
            return Err(CurseForgeError::Api {
                status: response.status,
            });
        }
        let listed: FilesWire =
            serde_json::from_str(&response.body).map_err(CurseForgeError::Listing)?;
        files.extend(listed.data.into_iter().map(CurseForgeFile::from));
    }
    Ok(files)
}

/// Resolve file references to files, in the order given.
pub fn resolve_curseforge_files(
    token: &str,
    references: &[FileRef],
    api_base: &str,
) -> Result<Vec<CurseForgeFile>, CurseForgeError> {
    let ids: Vec<u64> = references
        .iter()
        .map(FileRef::id)
        .collect::<Result<_, _>>()?;
    let found: HashMap<u64, CurseForgeFile> = fetch_curseforge_files(token, &ids, api_base)?
        .into_iter()
        .map(|file| (file.file_id, file))
        .collect();

    // Cloned out rather than taken: the same file may be asked for twice, to
    // go at two paths.
    ids.iter()
        .map(|id| {
            found
                .get(id)
                .cloned()
                .ok_or(CurseForgeError::UnknownFile(*id))
        })
        .collect()
}

/// Turn resolved files into artifacts, each at the path chosen for it.
///
/// The paths are a second argument rather than a callback because choosing one
/// is the config author's function, which lives on the host.
pub fn file_artifacts(
    files: &[CurseForgeFile],
    paths: &[String],
) -> Result<Vec<Artifact>, CurseForgeError> {
    if files.len() != paths.len() {
        return Err(CurseForgeError::PathCount {
            files: files.len(),
            paths: paths.len(),
        });
    }
    Ok(files
        .iter()
        .zip(paths)
        .map(|(file, path)| artifact(file, path.clone()))
        .collect())
}

pub(crate) fn artifact(file: &CurseForgeFile, path: String) -> Artifact {
    Artifact {
        path,
        source: Source::Url {
            url: file.url.clone(),
        },
        size: Some(file.size),
        rules: Vec::new(),
        integrity: file
            .sha1
            .as_ref()
            .map(|sha1| Integrity::One(HashEntry::Sha1 { sha1: sha1.clone() })),
        discovery: None,
        metadata: None,
        extract: None,
    }
}
