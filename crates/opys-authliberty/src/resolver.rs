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

use opys_dev::gitlab::{resolve_gitlab_package_file, FileSelector, GitLabError, GITLAB_BASE};
use serde::{Deserialize, Serialize};

use crate::error::AuthLibertyError;

pub const DEFAULT_PROJECT: &str = "harmoniya/authliberty";
pub const DEFAULT_GITLAB: &str = GITLAB_BASE;
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

/// Resolve `version` — an exact version, or `latest` for the channel `main`
/// publishes to — against the registry.
///
/// The lookup itself is `opys-dev`'s: a generic package, its newest
/// publication of that version, and the newest `.jar` in it. What is this
/// crate's is knowing the package is called `authliberty` and holds one jar.
pub fn resolve_authliberty_version(
    version: &str,
    options: &ResolveAuthLibertyOptions,
) -> Result<AuthLibertyRelease, AuthLibertyError> {
    let project = options.project.as_deref().unwrap_or(DEFAULT_PROJECT);
    let file = resolve_gitlab_package_file(
        options.gitlab.as_deref().unwrap_or(DEFAULT_GITLAB),
        project,
        PACKAGE_NAME,
        version,
        FileSelector::Suffix(".jar"),
        options.token.as_deref(),
    )
    .map_err(|error| match error {
        GitLabError::Fetch(fetch) => AuthLibertyError::Fetch(fetch),
        GitLabError::NoVersion { available, .. } => AuthLibertyError::UnknownVersion {
            version: version.to_owned(),
            project: project.to_owned(),
            available,
        },
        GitLabError::NoFile { version, .. } => AuthLibertyError::NoJar {
            project: project.to_owned(),
            version,
        },
    })?;

    Ok(AuthLibertyRelease {
        version: file.version,
        filename: file.filename,
        url: file.url,
        size: file.size,
        sha256: file.sha256,
        created_at: file.created_at,
    })
}
