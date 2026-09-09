//! `opys-minecraft-vanilla` — vanilla Minecraft, and the mappers the rest of
//! the loader family is built out of.
//!
//! Turns a Mojang version JSON into the artifacts, vars and launch groups a
//! manifest needs. [`mappers`] is the shared half: forge, fabric, neoforge,
//! cleanroom and lwjgl3ify each resolve their own version JSON and then reuse
//! the same classpath, launch, library and asset mapping, so each gets its own
//! crate depending on this one — mirroring how the npm packages already sit.
//!
//! Each of those crates ships its own addon — this one is
//! `opys-minecraft-vanilla-napi` → `@opys/minecraft-vanilla-binding` — so a
//! binding is always named after the single module it exposes.
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
    build_classpath, build_launch, inherited_classpath, library_to_artifact, map_asset_index,
    map_asset_objects, map_client_jar, map_libraries, superseded, ClasspathEntry, LaunchParts,
};
pub use vanilla::{
    build_minecraft, client_to_template, patch_to_template, resolve_client_template,
    resolve_minecraft, MinecraftOptions, MinecraftTemplate, PLUGIN_NAME,
};
