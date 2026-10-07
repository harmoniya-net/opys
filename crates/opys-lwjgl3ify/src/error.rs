use thiserror::Error;

#[derive(Debug, Error)]
pub enum Lwjgl3ifyError {
    /// A failed JSON GET — transport, a non-2xx status, or an undecodable body.
    #[error(transparent)]
    Fetch(#[from] opys_dev::JsonGetError),
    /// A document that is not a version JSON.
    #[error(transparent)]
    Document(#[from] opys_mojang::MojangError),
    #[error(transparent)]
    Minecraft(#[from] opys_minecraft_vanilla::MinecraftError),
    /// Looking the mod jars up on GitHub Releases.
    #[error(transparent)]
    GitHub(#[from] opys_dev::github::GitHubError),
    #[error("Could not resolve lwjgl3ify version '{input}' from {source_url}")]
    UnresolvableVersion { input: String, source_url: String },
    #[error("Unknown Minecraft version '{minecraft}' (resolving '{input}')")]
    UnknownMinecraft { minecraft: String, input: String },
    #[error("No '{alias}' lwjgl3ify build available for Minecraft {minecraft}")]
    NoAliasBuild { alias: String, minecraft: String },
    #[error("Release '{tag}' of {repo} carries no {what}")]
    NoModJar {
        tag: String,
        repo: String,
        what: &'static str,
    },
}
