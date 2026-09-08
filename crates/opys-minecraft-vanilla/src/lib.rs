//! `opys-minecraft-vanilla` — vanilla Minecraft, and the mappers the rest of
//! the loader family is built out of.
//!
//! Turns a Mojang version JSON into the artifacts, vars and launch groups a
//! manifest needs. [`mappers`] is the shared half: forge, fabric, neoforge,
//! cleanroom and lwjgl3ify each resolve their own version JSON and then reuse
//! the same classpath, launch, library and asset mapping, so each gets its own
//! crate depending on this one — mirroring how the npm packages already sit.
//!
//! One `.node` serves all of them (`opys-minecraft-napi` →
//! `@opys/minecraft-binding`); a crate per loader would otherwise mean a
//! binding per loader across seven target triples.
//!
//! Build-time only: the requests go through `opys-dev`'s one-shot blocking
//! GET, which the runtime never links.

mod error;
mod fetch;
mod mappers;
mod vanilla;

pub use error::MinecraftError;
pub use fetch::{fetch_asset_manifest, fetch_client, fetch_version_manifest};
pub use mappers::{
    build_classpath, build_launch, library_to_artifact, map_asset_index, map_asset_objects,
    map_client_jar, map_libraries, ClasspathEntry, LaunchParts,
};
pub use vanilla::{
    build_minecraft, client_to_template, resolve_client_template, resolve_minecraft,
    MinecraftOptions, MinecraftTemplate, PLUGIN_NAME,
};
