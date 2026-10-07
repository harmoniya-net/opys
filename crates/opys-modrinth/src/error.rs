use thiserror::Error;

#[derive(Debug, Error)]
pub enum ModrinthError {
    /// A failed JSON GET — transport, a non-2xx status, or an undecodable body.
    #[error(transparent)]
    Fetch(#[from] opys_dev::JsonGetError),
    /// A failed download of the pack itself.
    #[error(transparent)]
    Download(#[from] opys_dev::HttpError),
    #[error("Failed to download .mrpack: HTTP {status} ({url})")]
    DownloadStatus { status: u16, url: String },
    #[error(transparent)]
    Archive(#[from] opys_modpack::ArchiveError),
    #[error("modrinth.index.json is not a modpack index: {0}")]
    Index(#[from] serde_json::Error),

    #[error("Modrinth version ref \"{0}\" does not contain \"/version/<id>\" — expected a version ID or a Modrinth version URL.")]
    BadVersionRef(String),
    #[error("Modrinth modpack ref \"{0}\" is a URL but neither a .mrpack file nor a /version/<id> link.")]
    BadModpackRef(String),
    #[error("Modrinth API did not return metadata for version {0}")]
    UnknownVersion(String),
    #[error("Modrinth version {0} has no downloadable files")]
    NoFiles(String),
    #[error("Modrinth version {0} has no .mrpack file — is it a modpack?")]
    NotAModpack(String),
    #[error("Modrinth modpack file \"{0}\" has no download URL.")]
    NoDownload(String),
    #[error("Modrinth modpack index is missing its \"minecraft\" dependency.")]
    NoMinecraft,
    #[error("Quilt modpacks are not supported — opys has no Quilt loader plugin.")]
    Quilt,
    #[error("{files} file(s) but {paths} path(s): each file needs exactly one")]
    PathCount { files: usize, paths: usize },
}
