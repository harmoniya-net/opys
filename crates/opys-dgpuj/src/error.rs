use thiserror::Error;

#[derive(Debug, Error)]
pub enum DgpujError {
    #[error(transparent)]
    GitHub(#[from] opys_dev::github::GitHubError),
    /// Hashing an asset GitHub published no digest for.
    #[error(transparent)]
    Pin(#[from] opys_dev::pin::PinError),
    #[error("No matching asset ({asset}) on GitHub release {tag}. Assets: {available}")]
    NoAsset {
        asset: String,
        tag: String,
        /// Every asset the release does have, or `(none)`.
        available: String,
    },
}
