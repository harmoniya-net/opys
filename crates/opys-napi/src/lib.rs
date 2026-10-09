//! The one addon of opys. Every crate that has a JS surface is a module
//! here and a namespace there: `opys-forge` is `mod forge` and, from JS,
//! `binding.forge`. A module names its own crate and what that crate is
//! built on, and an `@opys/*` package imports its own namespace — the
//! boundaries between crates are the boundaries between namespaces, and
//! `scripts/architecture` holds both.
//!
//! One `.node` rather than one per crate: nineteen addons each linked their
//! own copy of the HTTP client, TLS and serde, and together weighed five
//! times what this does.

#![deny(clippy::all)]

pub mod authliberty;
pub mod bifrost;
pub mod bundle;
pub mod cleanroom;
pub mod core;
pub mod curseforge;
pub mod dev;
pub mod dgpuj;
pub mod fabric;
pub mod forge;
pub mod java;
pub mod links;
pub mod lwjgl3ify;
pub mod minecraft_serverlist;
pub mod minecraft_vanilla;
pub mod modrinth;
pub mod mojang;
pub mod neoforge;
pub mod runtime;
