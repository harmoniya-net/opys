use thiserror::Error;

#[derive(Debug, Error)]
pub enum AuthLibertyError {
    /// A failed JSON GET — transport, a non-2xx status, or an undecodable body.
    #[error(transparent)]
    Fetch(#[from] opys_dev::JsonGetError),
    #[error("AuthLiberty version '{version}' not found in {project}. Available: {available}")]
    UnknownVersion {
        version: String,
        project: String,
        /// Up to eight versions the registry does hold, or `(none)`.
        available: String,
    },
    #[error("AuthLiberty package {project}@{version} has no .jar file")]
    NoJar { project: String, version: String },
}
