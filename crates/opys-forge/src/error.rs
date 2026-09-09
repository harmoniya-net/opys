use thiserror::Error;

#[derive(Debug, Error)]
pub enum ForgeError {
    /// A failed JSON GET — transport, a non-2xx status, or an undecodable body.
    #[error(transparent)]
    Fetch(#[from] opys_dev::JsonGetError),
    #[error(transparent)]
    Minecraft(#[from] opys_minecraft_vanilla::MinecraftError),
    #[error("Could not resolve Forge version '{input}' from {source_url}")]
    UnresolvableVersion { input: String, source_url: String },
    #[error("Unknown Minecraft version '{minecraft}' (resolving '{input}')")]
    UnknownMinecraft { minecraft: String, input: String },
    #[error("No '{alias}' Forge build available for Minecraft {minecraft}")]
    NoAliasBuild { alias: String, minecraft: String },
    #[error(transparent)]
    Rule(#[from] opys_core::RuleError),
}
