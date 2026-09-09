//! Version-JSON → manifest artifacts.
//!
//! Shared by every loader in the family: forge, fabric, neoforge, cleanroom
//! and lwjgl3ify all reuse the classpath, launch and library mappers on top of
//! their own resolved version JSON — which is why each of those crates depends
//! on this one. Entirely pure: a `Client` in, artifacts and vars out.

mod assets;
mod client;
mod launch;
mod libraries;

pub use assets::{map_asset_index, map_asset_objects};
pub use client::map_client_jar;
pub use launch::{
    build_classpath, build_launch, inherited_classpath, superseded, ClasspathEntry, LaunchParts,
};
pub use libraries::{library_to_artifact, map_libraries};
