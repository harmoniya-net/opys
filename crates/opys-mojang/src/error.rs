use thiserror::Error;

#[derive(Debug, Error)]
pub enum MojangError {
    #[error("Invalid Maven coordinate: \"{0}\"")]
    InvalidMaven(String),
    #[error("Missing arguments in client JSON")]
    MissingArguments,
    #[error("invalid os name '{0}'")]
    InvalidOsName(String),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}
