use thiserror::Error;

#[derive(Debug, Error)]
pub enum FabricError {
    /// A failed JSON GET — transport, a non-2xx status, or an undecodable body.
    #[error(transparent)]
    Fetch(#[from] opys_dev::JsonGetError),
    #[error(transparent)]
    Minecraft(#[from] opys_minecraft_vanilla::MinecraftError),
    #[error(transparent)]
    Mojang(#[from] opys_mojang::MojangError),
    #[error("No Fabric loader build found for Minecraft '{0}'")]
    NoLoaderBuild(String),
    #[error("Fabric library coordinate '{0}' has no version")]
    UnversionedLibrary(String),
    #[error(transparent)]
    Rule(#[from] opys_core::RuleError),
}
