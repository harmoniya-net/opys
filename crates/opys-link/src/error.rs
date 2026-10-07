use thiserror::Error;

#[derive(Debug, Error)]
pub enum LinkError {
    #[error("\"{0}\" is not a link — expected an http(s) URL.")]
    NotAUrl(String),
    #[error(transparent)]
    GitHub(#[from] opys_dev::github::GitHubError),
    #[error(transparent)]
    GitLab(#[from] opys_dev::gitlab::GitLabError),
    #[error(transparent)]
    Modrinth(#[from] opys_modrinth::ModrinthError),
    #[error(transparent)]
    CurseForge(#[from] opys_curseforge::CurseForgeError),
    #[error(transparent)]
    Pin(#[from] opys_dev::pin::PinError),
    #[error("Release '{tag}' of {repo} has no asset '{asset}'. It has: {available}")]
    NoAsset {
        repo: String,
        tag: String,
        asset: String,
        /// Up to eight of the names it does have, or `(none)`.
        available: String,
    },
    #[error(
        "{link} is a CurseForge file, which needs an API key to resolve — pass `curseforgeToken`."
    )]
    NoCurseForgeToken { link: String },
    #[error("{files} file(s) but {paths} path(s): each file needs exactly one")]
    PathCount { files: usize, paths: usize },
}
