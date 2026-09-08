use thiserror::Error;

#[derive(Debug, Error)]
pub enum MinecraftError {
    /// A failed JSON GET — transport, a non-2xx status, or an undecodable body.
    #[error(transparent)]
    Fetch(#[from] opys_dev::JsonGetError),
    #[error(transparent)]
    Mojang(#[from] opys_mojang::MojangError),
    #[error("Version '{0}' not found in the Mojang version manifest")]
    VersionNotFound(String),
    #[error("The Mojang version manifest lists no current release")]
    NoLatestRelease,
    #[error(transparent)]
    Rule(#[from] opys_mojang_rules::RuleError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}
