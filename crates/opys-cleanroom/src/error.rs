use thiserror::Error;

#[derive(Debug, Error)]
pub enum CleanroomError {
    /// A failed JSON GET — transport, a non-2xx status, or an undecodable body.
    #[error(transparent)]
    Fetch(#[from] opys_dev::JsonGetError),
    /// A document that is not a version JSON.
    #[error(transparent)]
    Document(#[from] opys_mojang::MojangError),
    #[error(transparent)]
    Minecraft(#[from] opys_minecraft_vanilla::MinecraftError),
    #[error("Could not resolve Cleanroom version '{input}' from {source_url}")]
    UnresolvableVersion { input: String, source_url: String },
    #[error("Unknown Minecraft version '{minecraft}' (resolving '{input}')")]
    UnknownMinecraft { minecraft: String, input: String },
    #[error("No '{alias}' Cleanroom build available for Minecraft {minecraft}")]
    NoAliasBuild { alias: String, minecraft: String },
}
