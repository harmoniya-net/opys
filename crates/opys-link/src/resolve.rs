//! Asking the provider a link belongs to.

use std::collections::HashMap;

use opys_core::{Artifact, HashEntry, Integrity, Source};
use opys_curseforge::{resolve_curseforge_files, FileRef, CURSEFORGE_API};
use opys_dev::github::{
    fetch_github_release, github_asset_sha256, pick_github_release, GitHubRelease as Release,
    ReleaseSelector, GITHUB_API_BASE,
};
use opys_dev::gitlab::{resolve_gitlab_package_file, FileSelector};
use opys_dev::pin::pin_url;
use opys_modrinth::{resolve_modrinth_files, MODRINTH_API};
use serde::{Deserialize, Serialize};

use crate::error::LinkError;
use crate::link::{parse_link, url_filename, GitHubRelease, Link};

/// Where a file was resolved.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    GitHub,
    GitLab,
    Modrinth,
    CurseForge,
    /// No provider: the URL was the file.
    Url,
}

/// A link, resolved: a concrete download with its size and a hash.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedFile {
    /// The link as it was given.
    pub link: String,
    pub provider: Provider,
    pub filename: String,
    /// Where the file is downloaded from. Not always the link: a `latest`
    /// link resolves to the release it meant, and a page to the file behind it.
    pub url: String,
    pub size: u64,
    /// sha256 where the provider publishes one or the file was hashed here;
    /// sha1 from Modrinth and CurseForge. Absent only for a CurseForge file
    /// published without one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub integrity: Option<HashEntry>,
}

/// Tokens and API bases. Every field is optional; a token is needed only for
/// CurseForge, which has no anonymous API.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct LinkOptions {
    /// Raises GitHub's rate limit, and reaches private repositories.
    pub github_token: Option<String>,
    /// Reaches private GitLab projects.
    pub gitlab_token: Option<String>,
    /// Required for any CurseForge link.
    pub curseforge_token: Option<String>,
    /// GitHub API base. `None` is the public API.
    pub github_api: Option<String>,
    /// Modrinth API base. `None` is the public API.
    pub modrinth_api: Option<String>,
    /// CurseForge API base. `None` is the public API.
    pub curseforge_api: Option<String>,
}

fn sha256(hex: impl Into<String>) -> Option<HashEntry> {
    Some(HashEntry::Sha256 { sha256: hex.into() })
}

fn sha1(hex: Option<String>) -> Option<HashEntry> {
    hex.map(|sha1| HashEntry::Sha1 { sha1 })
}

fn github(
    link: &str,
    repo: &str,
    release: &GitHubRelease,
    asset: &str,
    options: &LinkOptions,
) -> Result<ResolvedFile, LinkError> {
    let api = options.github_api.as_deref().unwrap_or(GITHUB_API_BASE);
    let token = options.github_token.as_deref();
    let has_asset = |r: &Release| r.assets.iter().any(|a| a.name == asset);

    let found = match release {
        GitHubRelease::Tag(tag) => fetch_github_release(api, repo, tag, token)?,
        // The newest release that actually carries the asset: a repository's
        // latest release is not always one that ships every file.
        GitHubRelease::Latest => {
            pick_github_release(api, repo, &ReleaseSelector::Latest, token, Some(&has_asset))?
        }
    };
    let file = found
        .assets
        .iter()
        .find(|a| a.name == asset)
        .ok_or_else(|| {
            let names: Vec<&str> = found
                .assets
                .iter()
                .take(8)
                .map(|a| a.name.as_str())
                .collect();
            LinkError::NoAsset {
                repo: repo.to_owned(),
                tag: found.tag_name.clone(),
                asset: asset.to_owned(),
                available: if names.is_empty() {
                    "(none)".to_owned()
                } else {
                    names.join(", ")
                },
            }
        })?;

    // GitHub has computed a digest for assets uploaded since 2024. For one
    // older than that, the file is hashed here.
    let (size, integrity) = match github_asset_sha256(file) {
        Some(digest) => (file.size, sha256(digest)),
        None => {
            let pinned = pin_url(&file.browser_download_url, &[])?;
            (pinned.size, sha256(pinned.sha256))
        }
    };
    Ok(ResolvedFile {
        link: link.to_owned(),
        provider: Provider::GitHub,
        filename: file.name.clone(),
        url: file.browser_download_url.clone(),
        size,
        integrity,
    })
}

/// Resolve links to files, in the order given.
///
/// Modrinth and CurseForge links are looked up together, a batch to a request,
/// however they are interleaved with the rest; every other link is its own
/// request or two. A link that fails stops the build — there is no partial
/// result, because a manifest missing a file is not a smaller manifest.
pub fn resolve_links(
    links: &[String],
    options: &LinkOptions,
) -> Result<Vec<ResolvedFile>, LinkError> {
    let parsed: Vec<Link> = links
        .iter()
        .map(|link| parse_link(link))
        .collect::<Result<_, _>>()?;

    let modrinth_ids: Vec<String> = parsed
        .iter()
        .filter_map(|link| match link {
            Link::Modrinth { version_id } => Some(version_id.clone()),
            _ => None,
        })
        .collect();
    let modrinth: HashMap<String, opys_modrinth::ModrinthFile> = if modrinth_ids.is_empty() {
        HashMap::new()
    } else {
        let api = options.modrinth_api.as_deref().unwrap_or(MODRINTH_API);
        resolve_modrinth_files(&modrinth_ids, api)?
            .into_iter()
            .map(|file| (file.version_id.clone(), file))
            .collect()
    };

    let curseforge_ids: Vec<FileRef> = parsed
        .iter()
        .filter_map(|link| match link {
            Link::CurseForge { file_id } => Some(FileRef::Id(*file_id)),
            _ => None,
        })
        .collect();
    let curseforge: HashMap<u64, opys_curseforge::CurseForgeFile> = if curseforge_ids.is_empty() {
        HashMap::new()
    } else {
        let token = options.curseforge_token.as_deref().ok_or_else(|| {
            let first = links
                .iter()
                .zip(&parsed)
                .find(|(_, link)| matches!(link, Link::CurseForge { .. }))
                .map(|(link, _)| link.clone())
                .unwrap_or_default();
            LinkError::NoCurseForgeToken { link: first }
        })?;
        let api = options.curseforge_api.as_deref().unwrap_or(CURSEFORGE_API);
        resolve_curseforge_files(token, &curseforge_ids, api)?
            .into_iter()
            .map(|file| (file.file_id, file))
            .collect()
    };

    links
        .iter()
        .zip(&parsed)
        .map(|(link, parsed)| match parsed {
            Link::GitHub {
                repo,
                release,
                asset,
            } => github(link, repo, release, asset, options),
            Link::GitLab {
                base,
                project,
                package,
                version,
                file,
            } => {
                let found = resolve_gitlab_package_file(
                    base,
                    project,
                    package,
                    version,
                    FileSelector::Named(file),
                    options.gitlab_token.as_deref(),
                )?;
                // GitLab reports a sha256 for nearly every file; for the rare
                // one it does not, hash it here like any plain URL.
                let (size, integrity) = match found.sha256 {
                    Some(digest) => (found.size, sha256(digest)),
                    None => {
                        let token = options.gitlab_token.as_deref();
                        let headers: Vec<(&str, &str)> =
                            token.map(|t| ("PRIVATE-TOKEN", t)).into_iter().collect();
                        let pinned = pin_url(&found.url, &headers)?;
                        (pinned.size, sha256(pinned.sha256))
                    }
                };
                Ok(ResolvedFile {
                    link: link.clone(),
                    provider: Provider::GitLab,
                    filename: found.filename,
                    url: found.url,
                    size,
                    integrity,
                })
            }
            Link::Modrinth { version_id } => {
                // Present: `resolve_modrinth_files` fails on any id it is not
                // given back.
                let file = &modrinth[version_id];
                Ok(ResolvedFile {
                    link: link.clone(),
                    provider: Provider::Modrinth,
                    filename: file.filename.clone(),
                    url: file.url.clone(),
                    size: file.size,
                    integrity: sha1(file.sha1.clone()),
                })
            }
            Link::CurseForge { file_id } => {
                let file = &curseforge[file_id];
                Ok(ResolvedFile {
                    link: link.clone(),
                    provider: Provider::CurseForge,
                    filename: file.filename.clone(),
                    url: file.url.clone(),
                    size: file.size,
                    integrity: sha1(file.sha1.clone()),
                })
            }
            Link::Url(url) => {
                let pinned = pin_url(url, &[])?;
                Ok(ResolvedFile {
                    link: link.clone(),
                    provider: Provider::Url,
                    filename: url_filename(url),
                    url: url.clone(),
                    size: pinned.size,
                    integrity: sha256(pinned.sha256),
                })
            }
        })
        .collect()
}

/// Turn resolved files into artifacts, each at the path chosen for it.
///
/// The paths are a second argument rather than a callback because choosing one
/// is the config author's function, which lives on the host.
pub fn file_artifacts(
    files: &[ResolvedFile],
    paths: &[String],
) -> Result<Vec<Artifact>, LinkError> {
    if files.len() != paths.len() {
        return Err(LinkError::PathCount {
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
            integrity: file.integrity.clone().map(Integrity::One),
            metadata: None,
            extract: None,
        })
        .collect())
}
