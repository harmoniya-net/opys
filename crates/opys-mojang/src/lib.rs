//! Mojang protocol parsers: version manifest, client JSON, libraries, assets,
//! Maven coordinates.
//!
//! Pure — no network, no filesystem. Callers fetch; this crate deserialises.
//! Every wire type implements `Deserialize`, so a document is read with
//! `serde_json::from_str::<Client>(..)` rather than a bespoke parse function,
//! and operations on those types are inherent methods rather than free
//! functions — `coord.parse()?`, `coord.to_string()`, `base.merge(&patch)`,
//! `manifest.latest_release()`.
//!
//! Depends only on `opys-mojang-rules`; in particular **not** on `opys-core`,
//! so `Val`/`Valset` are deliberately absent (see [`MojangArgValue`]).

mod arguments;
mod assets;
mod client;
mod downloads;
mod error;
mod java;
mod libraries;
mod logging;
mod maven;
mod patch;
mod version;

pub use arguments::{ArgValue, Arguments, MojangArgValue};
pub use assets::{asset_path, asset_url, AssetIndex, AssetManifest, AssetObject};
pub use client::{Client, ClientMetadata};
pub use downloads::{Downloads, DownloadsFile};
pub use error::MojangError;
pub use java::JavaVersion;
pub use libraries::{Artifact, Libraries, Library};
pub use logging::{Logging, LoggingClient, LoggingFile};
pub use maven::MavenCoord;
pub use patch::VersionPatch;
pub use version::{Latest, Version, VersionManifest, VERSION_MANIFEST_URL};
