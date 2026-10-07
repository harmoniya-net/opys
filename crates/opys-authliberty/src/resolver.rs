//! AuthLiberty releases, from a GitLab generic package registry.
//!
//! AuthLiberty's CI publishes the agent jar to two channels:
//!   - `latest`     — replaced on every push to `main`, `authliberty-latest.jar`
//!   - `<version>`  — tagged releases, `authliberty-<version>.jar`
//!
//! Both are one `.jar` in a generic package named `authliberty`. GitLab
//! reports the file's sha256 through the `package_files` API, and that is the
//! integrity the manifest carries. `latest` changes hash whenever a build
//! replaces it; whichever it is at build time is what gets frozen in.

use opys_dev::http::get_json;
use opys_dev::url::encode_uri_component;
use serde::{Deserialize, Serialize};

use crate::error::AuthLibertyError;

pub const DEFAULT_PROJECT: &str = "harmoniya/authliberty";
pub const DEFAULT_GITLAB: &str = "https://gitlab.com";
const PACKAGE_NAME: &str = "authliberty";

/// One resolved agent jar.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthLibertyRelease {
    /// Package version, e.g. `0.3` or `latest`.
    pub version: String,
    /// Asset filename, e.g. `authliberty-0.3.jar`.
    pub filename: String,
    /// Direct download URL for the agent jar.
    pub url: String,
    /// Asset size in bytes.
    pub size: u64,
    /// sha256 of the asset (hex), when GitLab reports one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// ISO timestamp the package was created.
    pub created_at: String,
}

/// Where to look.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ResolveAuthLibertyOptions {
    /// GitLab project path `group/name`. `None` is [`DEFAULT_PROJECT`].
    pub project: Option<String>,
    /// GitLab instance URL. `None` is [`DEFAULT_GITLAB`].
    pub gitlab: Option<String>,
    /// GitLab token, for a private project or a higher rate limit.
    pub token: Option<String>,
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

/// Resolve `version` — an exact version, or `latest` for the channel `main`
/// publishes to — against the registry.
pub fn resolve_authliberty_version(
    version: &str,
    options: &ResolveAuthLibertyOptions,
) -> Result<AuthLibertyRelease, AuthLibertyError> {
    let project = options.project.as_deref().unwrap_or(DEFAULT_PROJECT);
    let base = options
        .gitlab
        .as_deref()
        .unwrap_or(DEFAULT_GITLAB)
        .trim_end_matches('/');
    // A project path is one path segment to GitLab: `group%2Fname`.
    let project_segment = encode_uri_component(project);
    let headers: Vec<(&str, &str)> = options
        .token
        .as_deref()
        .map(|token| ("PRIVATE-TOKEN", token))
        .into_iter()
        .collect();

    let listed: Vec<PackageWire> = get_json(
        &format!(
            "{base}/api/v4/projects/{project_segment}/packages?package_type=generic&package_name={PACKAGE_NAME}&per_page=100"
        ),
        &headers,
    )?;
    // GitLab's `package_name` filter is a fuzzy match, so narrow to the exact
    // name and the generic registry, and drop anything not `default` — a
    // package still processing, or one that failed.
    let packages: Vec<PackageWire> = listed
        .into_iter()
        .filter(|p| p.name == PACKAGE_NAME && p.package_type == "generic" && p.status == "default")
        .collect();

    let mut available: Vec<&str> = Vec::new();
    for package in &packages {
        if !available.contains(&package.version.as_str()) {
            available.push(&package.version);
        }
    }
    let available = if available.is_empty() {
        "(none)".to_owned()
    } else {
        available.into_iter().take(8).collect::<Vec<_>>().join(", ")
    };

    // The same version can be published again; the most recent package wins.
    let package = newest(packages.into_iter().filter(|p| p.version == version), |p| {
        &p.created_at
    })
    .ok_or_else(|| AuthLibertyError::UnknownVersion {
        version: version.to_owned(),
        project: project.to_owned(),
        available,
    })?;

    let files: Vec<PackageFileWire> = get_json(
        &format!(
            "{base}/api/v4/projects/{project_segment}/packages/{}/package_files?per_page=100",
            package.id
        ),
        &headers,
    )?;
    let jar = newest(
        files.into_iter().filter(|f| f.file_name.ends_with(".jar")),
        |f| &f.created_at,
    )
    .ok_or_else(|| AuthLibertyError::NoJar {
        project: project.to_owned(),
        version: package.version.clone(),
    })?;

    Ok(AuthLibertyRelease {
        url: format!(
            "{base}/api/v4/projects/{project_segment}/packages/generic/{PACKAGE_NAME}/{}/{}",
            encode_uri_component(&package.version),
            encode_uri_component(&jar.file_name),
        ),
        version: package.version,
        filename: jar.file_name,
        size: jar.size,
        sha256: jar.file_sha256,
        created_at: package.created_at,
    })
}
