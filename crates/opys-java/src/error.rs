use opys_dev::github::GitHubError;
use opys_dev::HttpError;

/// Everything a JDK resolve can fail with. Wire-level and API-level failures
/// stay distinct so a caller can tell "the network broke" from "this vendor
/// has no such build".
#[derive(Debug, thiserror::Error)]
pub enum JavaError {
    #[error(transparent)]
    Http(#[from] HttpError),
    #[error(transparent)]
    GitHub(#[from] GitHubError),
    #[error("{vendor} API {status} for {os}/{arch}")]
    Api {
        vendor: &'static str,
        status: u16,
        os: &'static str,
        arch: &'static str,
    },
    #[error("{vendor} returned an unreadable response for {os}/{arch}: {source}")]
    Malformed {
        vendor: &'static str,
        os: &'static str,
        arch: &'static str,
        #[source]
        source: serde_json::Error,
    },
    #[error("No {vendor} binaries found for version '{version}' across requested platforms.")]
    NoBinaries {
        vendor: &'static str,
        version: String,
    },
    #[error(
        "opys-java: GraalVM release '{tag}' doesn't use the standard 'jdk-<major>.…' tag — \
         only that release cadence is supported."
    )]
    UnsupportedTag { tag: String },
}
