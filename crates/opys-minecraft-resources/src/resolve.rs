//! Asking whoever publishes each entry for its file.

use std::path::{Path, PathBuf};

use opys_core::HashEntry;
use opys_curseforge::{
    fetch_curseforge_slugs, resolve_curseforge_files, CurseForgeError, CurseForgeFile, FileRef,
    CURSEFORGE_API,
};
use opys_dev::github::{fetch_github_release, GITHUB_API_BASE};
use opys_dev::scan_directory;
use opys_dev::url::encode_uri_component;
use opys_links::{resolve_links, LinkOptions};
use opys_modrinth::{resolve_modrinth_project_file, ModrinthFile, MODRINTH_API};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::entry::{EntrySource, GitHubAsset, GitLabFile};
use crate::error::ResourcesError;
use crate::file::{Listed, ResourceFile, Side};

/// How many Modrinth projects are asked about at once. A project is its own
/// request, there being no batch that takes a project and a version number,
/// so a pack of a hundred mods would otherwise be a hundred requests in a
/// row on every build.
const PARALLEL: usize = 8;

/// gitlab.com, where a GitLab entry is unless it says otherwise.
const GITLAB: &str = "https://gitlab.com";

/// Where a resolved file's bytes are: published, or on this machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ResourceSource {
    Url {
        url: String,
    },
    /// Carried in the bundle, as `files` carries one.
    File {
        file: PathBuf,
    },
}

/// An entry's file, resolved: where it is, its size, and a hash where
/// somebody publishes one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedResource {
    /// The directory it was listed under, by name.
    pub dir: String,
    /// The key it was listed by.
    pub key: String,
    /// Where it goes in its directory: the key with the file's extension,
    /// or for a file of a folder the key and then its path in the folder.
    pub path: String,
    pub source: ResourceSource,
    pub size: u64,
    /// Absent for a file from disk, which is named by its content once it
    /// is carried, and for a CurseForge file published without a sha1.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub integrity: Option<HashEntry>,
    /// The entry's own, as it was written.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Map<String, Value>>,
}

/// The name a file is installed by: its key, with the extension of the file
/// it turned out to be. A published name carries a version, so a new
/// version would be a new file beside the old; a key does not change.
///
/// A key that has a dot is the whole name, `options.txt`, and is left as
/// it is.
fn installed_name(key: &str, filename: &str) -> String {
    let extension = Path::new(filename).extension().and_then(|e| e.to_str());
    match extension {
        Some(extension) if !key.contains('.') => format!("{key}.{extension}"),
        _ => key.to_owned(),
    }
}

/// A file from disk, as far as it is known before it is placed.
struct Local {
    path: String,
    file: PathBuf,
    size: u64,
}

/// What a `file:` entry names beside the resources file: one file, or with
/// a trailing `/` every file of a folder, in a folder named by the key. The
/// key `.` is the directory itself.
fn local(listed: &Listed, path: &str, base: &Path) -> Result<Vec<Local>, ResourcesError> {
    let at = base.join(path);
    let shown = || at.display().to_string();
    let entry = listed.label();
    if path.ends_with('/') {
        if !at.is_dir() {
            return Err(ResourcesError::NoFolder {
                entry,
                path: shown(),
            });
        }
        return Ok(scan_directory(&at)?
            .into_iter()
            .map(|found| Local {
                path: match listed.key {
                    "." => found.rel,
                    key => format!("{key}/{}", found.rel),
                },
                file: found.abs,
                size: found.size,
            })
            .collect());
    }
    let about = std::fs::metadata(&at).map_err(|_| ResourcesError::NoFile {
        entry: entry.clone(),
        path: shown(),
    })?;
    // A folder is asked for with its slash, so one is never taken by a slip.
    if about.is_dir() {
        return Err(ResourcesError::IsFolder { entry });
    }
    if listed.key == "." {
        return Err(ResourcesError::DotForAFile { entry });
    }
    Ok(vec![Local {
        path: installed_name(listed.key, path),
        file: at,
        size: about.len(),
    }])
}

/// A release asset as the link `links` reads. Where the entry names no
/// asset the release is asked what it has, and has to have one.
fn github_link(
    listed: &Listed,
    asked: &GitHubAsset,
    options: &LinkOptions,
) -> Result<String, ResourcesError> {
    let asset = match &asked.asset {
        Some(asset) => asset.clone(),
        None => {
            let api = options.github_api.as_deref().unwrap_or(GITHUB_API_BASE);
            let release = fetch_github_release(
                api,
                &asked.repo,
                &asked.tag,
                options.github_token.as_deref(),
            )?;
            match release.assets.as_slice() {
                [only] => only.name.clone(),
                assets => {
                    return Err(ResourcesError::WhichAsset {
                        entry: listed.label(),
                        repo: asked.repo.clone(),
                        tag: asked.tag.clone(),
                        count: assets.len(),
                        available: assets
                            .iter()
                            .map(|asset| asset.name.as_str())
                            .collect::<Vec<_>>()
                            .join(", "),
                    })
                }
            }
        }
    };
    Ok(format!(
        "https://github.com/{}/releases/download/{}/{}",
        asked.repo,
        encode_uri_component(&asked.tag),
        encode_uri_component(&asset)
    ))
}

/// A package file as the link `links` reads.
fn gitlab_link(asked: &GitLabFile) -> String {
    format!(
        "{}/api/v4/projects/{}/packages/generic/{}/{}/{}",
        asked
            .host
            .as_deref()
            .unwrap_or(GITLAB)
            .trim_end_matches('/'),
        encode_uri_component(&asked.project),
        encode_uri_component(&asked.package),
        encode_uri_component(&asked.version),
        encode_uri_component(&asked.asset)
    )
}

fn sha1(hex: Option<String>) -> Option<HashEntry> {
    hex.map(|sha1| HashEntry::Sha1 { sha1 })
}

/// `ask` of every item, a few at a time, answers in the order of the items.
fn in_parallel<T: Sync, R: Send>(items: &[T], ask: impl Fn(&T) -> R + Sync) -> Vec<R> {
    items
        .chunks(PARALLEL)
        .flat_map(|chunk| {
            std::thread::scope(|scope| {
                let asked: Vec<_> = chunk.iter().map(|item| scope.spawn(|| ask(item))).collect();
                asked
                    .into_iter()
                    .map(|one| {
                        one.join()
                            .unwrap_or_else(|panic| std::panic::resume_unwind(panic))
                    })
                    .collect::<Vec<R>>()
            })
        })
        .collect()
}

fn modrinth(
    wanted: &[(&str, &str, Option<&str>)],
    options: &LinkOptions,
) -> Result<Vec<ModrinthFile>, ResourcesError> {
    let api = options.modrinth_api.as_deref().unwrap_or(MODRINTH_API);
    in_parallel(wanted, |(project, version, loader)| {
        resolve_modrinth_project_file(project, version, *loader, api)
    })
    .into_iter()
    .map(|file| file.map_err(ResourcesError::from))
    .collect()
}

/// The CurseForge files, each held to the project its entry names.
fn curseforge(
    wanted: &[(String, &str, u64)],
    options: &LinkOptions,
) -> Result<Vec<CurseForgeFile>, ResourcesError> {
    let Some((first, _, _)) = wanted.first() else {
        return Ok(Vec::new());
    };
    let token =
        options
            .curseforge_token
            .as_deref()
            .ok_or_else(|| ResourcesError::NoCurseForgeToken {
                entry: first.clone(),
            })?;
    let api = options.curseforge_api.as_deref().unwrap_or(CURSEFORGE_API);

    let ids: Vec<FileRef> = wanted.iter().map(|(_, _, id)| FileRef::Id(*id)).collect();
    let files = resolve_curseforge_files(token, &ids, api).map_err(|error| match error {
        // The id alone does not say which line of a file it was written on.
        CurseForgeError::UnknownFile(file_id) => wanted
            .iter()
            .find(|(_, _, id)| *id == file_id)
            .map(|(entry, _, _)| ResourcesError::NoSuchFile {
                entry: entry.clone(),
                file_id,
            })
            .unwrap_or(ResourcesError::CurseForge(error)),
        other => other.into(),
    })?;
    let projects: Vec<u64> = files.iter().map(|file| file.project_id).collect();
    let slugs = fetch_curseforge_slugs(token, &projects, api)?;

    for ((entry, project, file_id), file) in wanted.iter().zip(&files) {
        let actual = slugs.get(&file.project_id).map(String::as_str);
        if Some(*project) != actual {
            return Err(ResourcesError::WrongProject {
                entry: entry.clone(),
                file_id: *file_id,
                actual: actual
                    .map(str::to_owned)
                    .unwrap_or_else(|| format!("#{}", file.project_id)),
            });
        }
    }
    Ok(files)
}

/// Resolve what one side of a file installs, in the order it is listed.
///
/// `base` is the directory a `file:` entry is relative to: the resources
/// file's own. Files from disk are looked at first, since that asks nobody.
/// Then each provider is asked for all of its entries together: Modrinth a
/// project to a request and several at once, CurseForge in a batch, and the
/// rest, a link, a GitHub asset or a GitLab file, as `links` resolves one.
/// An entry that fails stops the build.
pub fn resolve_resources(
    file: &ResourceFile,
    side: Side,
    base: &Path,
    options: &LinkOptions,
) -> Result<Vec<ResolvedResource>, ResourcesError> {
    let wanted: Vec<Listed> = file.entries(side).collect();

    let mut from_disk = wanted
        .iter()
        .filter_map(|listed| match &listed.entry.source {
            EntrySource::File(path) => Some(local(listed, path, base)),
            _ => None,
        })
        .collect::<Result<Vec<_>, _>>()?
        .into_iter();
    let from_modrinth: Vec<(&str, &str, Option<&str>)> = wanted
        .iter()
        .filter_map(|listed| match &listed.entry.source {
            EntrySource::Modrinth {
                project,
                version,
                loader,
            } => Some((project.as_str(), version.as_str(), loader.as_deref())),
            _ => None,
        })
        .collect();
    let from_curseforge: Vec<(String, &str, u64)> = wanted
        .iter()
        .filter_map(|listed| match &listed.entry.source {
            EntrySource::CurseForge { project, file_id } => {
                Some((listed.label(), project.as_str(), *file_id))
            }
            _ => None,
        })
        .collect();
    let links: Vec<String> = wanted
        .iter()
        .filter_map(|listed| match &listed.entry.source {
            EntrySource::Url(url) => Some(Ok(url.clone())),
            EntrySource::GitHub(asked) => Some(github_link(listed, asked, options)),
            EntrySource::GitLab(asked) => Some(Ok(gitlab_link(asked))),
            _ => None,
        })
        .collect::<Result<_, _>>()?;

    // Each answers in the order it was asked, so each is read off in turn.
    let mut modrinth = modrinth(&from_modrinth, options)?.into_iter();
    let mut curseforge = curseforge(&from_curseforge, options)?.into_iter();
    let mut linked = resolve_links(&links, options)?.into_iter();

    Ok(wanted
        .into_iter()
        .flat_map(|listed| {
            let placed = |path, source, size, integrity| ResolvedResource {
                dir: listed.dir.to_owned(),
                key: listed.key.to_owned(),
                path,
                source,
                size,
                integrity,
                metadata: listed.entry.metadata.clone(),
            };
            let published = |filename: &str, url, size, integrity| {
                placed(
                    installed_name(listed.key, filename),
                    ResourceSource::Url { url },
                    size,
                    integrity,
                )
            };
            match &listed.entry.source {
                EntrySource::Modrinth { .. } => modrinth
                    .next()
                    .map(|file| published(&file.filename, file.url, file.size, sha1(file.sha1)))
                    .into_iter()
                    .collect::<Vec<_>>(),
                EntrySource::CurseForge { .. } => curseforge
                    .next()
                    .map(|file| published(&file.filename, file.url, file.size, sha1(file.sha1)))
                    .into_iter()
                    .collect(),
                EntrySource::Url(_) | EntrySource::GitHub(_) | EntrySource::GitLab(_) => linked
                    .next()
                    .map(|file| published(&file.filename, file.url, file.size, file.integrity))
                    .into_iter()
                    .collect(),
                EntrySource::File(_) => from_disk
                    .next()
                    .unwrap_or_default()
                    .into_iter()
                    .map(|local| {
                        placed(
                            local.path,
                            ResourceSource::File { file: local.file },
                            local.size,
                            None,
                        )
                    })
                    .collect(),
            }
        })
        .collect())
}
