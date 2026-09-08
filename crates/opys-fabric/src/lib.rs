//! `opys-fabric` — the Fabric loader.
//!
//! Fabric resolves its version JSON through the Fabric Meta API: a loader
//! build for a game version, then a launcher profile that names the vanilla
//! version it `inheritsFrom`. From there it is `opys-minecraft-vanilla`'s
//! mappers — the same classpath, launch, library and asset mapping every
//! loader in the family shares, so a fix to the per-OS classpath lands once.
//!
//! What is Fabric's own is small and lives here: the Meta layout, the profile
//! document, and profile libraries as Maven-laid-out artifacts.
//!
//! Build-time only: the requests go through `opys-dev`'s one-shot blocking
//! GET, which the runtime never links.

mod error;
mod profile;
mod resolver;
mod template;

pub use error::FabricError;
pub use profile::{fetch_profile, library_artifact, FabricLibrary, FabricProfile};
pub use resolver::{resolve_fabric_version, FabricRelease, DEFAULT_FABRIC_META};
pub use template::{
    build_fabric, profile_to_template, resolve_fabric, FabricOptions, FabricTemplate, PLUGIN_NAME,
};
