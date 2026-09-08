use thiserror::Error;

#[derive(Debug, Error)]
pub enum MinecraftError {
    #[error(transparent)]
    Http(#[from] opys_dev::HttpError),
    #[error(transparent)]
    Mojang(#[from] opys_mojang::MojangError),
    #[error("{url} returned HTTP {status}")]
    Api { url: String, status: u16 },
    #[error("Version '{0}' not found in the Mojang version manifest")]
    VersionNotFound(String),
    #[error("The Mojang version manifest lists no current release")]
    NoLatestRelease,
    #[error(transparent)]
    Rule(#[from] opys_mojang_rules::RuleError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}
