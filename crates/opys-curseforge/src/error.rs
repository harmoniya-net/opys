use thiserror::Error;

#[derive(Debug, Error)]
pub enum CurseForgeError {
    /// The request itself failed — DNS, TLS, connect.
    #[error(transparent)]
    Transport(#[from] opys_dev::HttpError),
    #[error("CurseForge API {status} (POST /mods/files)")]
    Api { status: u16 },
    #[error("CurseForge returned an unreadable file listing: {0}")]
    Listing(#[source] serde_json::Error),
    #[error("Failed to download CurseForge modpack: HTTP {status} ({url})")]
    DownloadStatus { status: u16, url: String },
    #[error(transparent)]
    Archive(#[from] opys_modpack::ArchiveError),
    #[error("manifest.json is not a modpack manifest: {0}")]
    Manifest(#[source] serde_json::Error),

    #[error("CurseForge file ref \"{0}\" does not contain \"/files/<id>\" — expected a numeric ID or a CurseForge file URL.")]
    BadFileRef(String),
    #[error("CurseForge API did not return metadata for file {0}")]
    UnknownFile(u64),
    #[error("CurseForge API did not return the modpack file {0}")]
    UnknownModpack(u64),
    #[error("CurseForge API did not return metadata for modpack file {file} (project {project})")]
    UnknownModpackFile { file: u64, project: u64 },
    #[error("CurseForge modpack manifest has no mod loader.")]
    NoLoader,
    #[error("Unknown CurseForge mod loader \"{0}\".")]
    UnknownLoader(String),
    #[error("Quilt modpacks are not supported — opys has no Quilt loader plugin.")]
    Quilt,
    #[error("{files} file(s) but {paths} path(s): each file needs exactly one")]
    PathCount { files: usize, paths: usize },
}
