//! GitLab's generic package registry.
//!
//! A generic package is a name, a version, and some files — the nearest thing
//! GitLab has to a release asset. The registry reports each file's sha256
//! through the `package_files` API, which is why a file here is resolved
//! through two API calls rather than taken at its URL: that hash is what gets
//! pinned.
//!
//! It began in `opys-authliberty`, whose agent jar is published this way, and
//! moved here when resolving an arbitrary link needed the same lookup.

use serde::{Deserialize, Serialize};

use crate::http::{get_json, JsonGetError};
use crate::url::encode_uri_component;

/// The public instance. Any other is named by its own base URL.
pub const GITLAB_BASE: &str = "https://gitlab.com";

/// One file of one version of a generic package.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLabPackageFile {
    /// Package version, e.g. `0.3` or `latest`.
    pub version: String,
    pub filename: String,
    /// The registry's download URL for the file.
    pub url: String,
    pub size: u64,
    /// sha256 (hex), when GitLab reports one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// ISO timestamp the package was created.
    pub created_at: String,
}

#[derive(Debug, thiserror::Error)]
pub enum GitLabError {
    /// A failed JSON GET — transport, a non-2xx status, or an undecodable body.
    #[error(transparent)]
    Fetch(#[from] JsonGetError),
    #[error("Package '{package}' has no version '{version}' in {project}. Available: {available}")]
    NoVersion {
        package: String,
        version: String,
        project: String,
        /// Up to eight versions the registry does hold, or `(none)`.
        available: String,
    },
    #[error("Package {project}/{package}@{version} has no {wanted}")]
    NoFile {
        project: String,
        package: String,
        version: String,
        /// What was looked for: `file 'x.jar'`, or `.jar file`.
        wanted: String,
    },
}

/// Which file of the package version to take.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileSelector<'a> {
    /// The file with exactly this name.
    Named(&'a str),
    /// The file ending in this suffix — `.jar` — for a package known to hold
    /// one such file under a name that changes with the version.
    Suffix(&'a str),
}

#[derive(Deserialize)]
pub(crate) struct PackageWire {
    id: u64,
    name: String,
    version: String,
    package_type: String,
    status: String,
    created_at: String,
}

#[derive(Deserialize)]
pub(crate) struct PackageFileWire {
    file_name: String,
    size: u64,
    #[serde(default)]
    file_sha256: Option<String>,
    created_at: String,
}

/// The newest of `items` by `created_at`. ISO timestamps order as text.
fn newest<T>(items: impl IntoIterator<Item = T>, created_at: impl Fn(&T) -> &str) -> Option<T> {
    items.into_iter().reduce(|latest, item| {
        if created_at(&item) > created_at(&latest) {
            item
        } else {
            latest
        }
    })
}

/// Resolve one file of `package`@`version` in `project`.
///
/// `base` is the instance (`https://gitlab.com`); `project` its path
/// (`group/name`) or numeric id. A version may have been published more than
/// once and a file uploaded more than once; the most recent of each wins.
pub fn resolve_gitlab_package_file(
    base: &str,
    project: &str,
    package: &str,
    version: &str,
    file: FileSelector<'_>,
    token: Option<&str>,
) -> Result<GitLabPackageFile, GitLabError> {
    let base = base.trim_end_matches('/');
    // A project path is one path segment to GitLab: `group%2Fname`.
    let project_segment = encode_uri_component(project);
    let headers: Vec<(&str, &str)> = token
        .map(|token| ("PRIVATE-TOKEN", token))
        .into_iter()
        .collect();

    let listed: Vec<PackageWire> = get_json(
        &format!(
            "{base}/api/v4/projects/{project_segment}/packages?package_type=generic&package_name={}&per_page=100",
            encode_uri_component(package)
        ),
        &headers,
    )?;
    // GitLab's `package_name` filter is a fuzzy match, so narrow to the exact
    // name and the generic registry, and drop anything not `default` — a
    // package still processing, or one that failed.
    let packages: Vec<PackageWire> = listed
        .into_iter()
        .filter(|p| p.name == package && p.package_type == "generic" && p.status == "default")
        .collect();

    let mut available: Vec<&str> = Vec::new();
    for candidate in &packages {
        if !available.contains(&candidate.version.as_str()) {
            available.push(&candidate.version);
        }
    }
    let available = if available.is_empty() {
        "(none)".to_owned()
    } else {
        available.into_iter().take(8).collect::<Vec<_>>().join(", ")
    };

    let found = newest(packages.into_iter().filter(|p| p.version == version), |p| {
        &p.created_at
    })
    .ok_or_else(|| GitLabError::NoVersion {
        package: package.to_owned(),
        version: version.to_owned(),
        project: project.to_owned(),
        available,
    })?;

    let files: Vec<PackageFileWire> = get_json(
        &format!(
            "{base}/api/v4/projects/{project_segment}/packages/{}/package_files?per_page=100",
            found.id
        ),
        &headers,
    )?;
    let chosen = newest(
        files.into_iter().filter(|f| match file {
            FileSelector::Named(name) => f.file_name == name,
            FileSelector::Suffix(suffix) => f.file_name.ends_with(suffix),
        }),
        |f| &f.created_at,
    )
    .ok_or_else(|| GitLabError::NoFile {
        project: project.to_owned(),
        package: package.to_owned(),
        version: found.version.clone(),
        wanted: match file {
            FileSelector::Named(name) => format!("file '{name}'"),
            FileSelector::Suffix(suffix) => format!("{suffix} file"),
        },
    })?;

    Ok(GitLabPackageFile {
        url: format!(
            "{base}/api/v4/projects/{project_segment}/packages/generic/{}/{}/{}",
            encode_uri_component(package),
            encode_uri_component(&found.version),
            encode_uri_component(&chosen.file_name),
        ),
        version: found.version,
        filename: chosen.file_name,
        size: chosen.size,
        sha256: chosen.file_sha256,
        created_at: found.created_at,
    })
}
