use thiserror::Error;

use crate::options::Core;

#[derive(Debug, Error)]
pub enum ServerError {
    /// The Mojang version manifest, or a version in it.
    #[error(transparent)]
    Minecraft(#[from] opys_minecraft_vanilla::MinecraftError),
    /// A failed JSON GET: transport, a non-2xx status, or an undecodable body.
    #[error(transparent)]
    Fetch(#[from] opys_dev::JsonGetError),
    /// Hashing a jar nobody publishes a hash for.
    #[error(transparent)]
    Pin(#[from] opys_dev::pin::PinError),
    #[error("Minecraft {0} has no server: Mojang publishes none for it")]
    NoServer(String),
    #[error("{core} has no server for {version}{}", build_suffix(.build))]
    NoBuild {
        core: Core,
        version: String,
        build: Option<String>,
    },
    #[error(
        "Forge {0} cannot be started: its server is run through NeoForge's starter, which reads the run scripts Forge has written since 1.17"
    )]
    ForgeTooOld(String),
}

fn build_suffix(build: &Option<String>) -> String {
    build
        .as_ref()
        .map(|build| format!(", build {build}"))
        .unwrap_or_default()
}
