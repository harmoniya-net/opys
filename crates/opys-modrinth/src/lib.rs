//! `opys-modrinth` — Modrinth, two ways.
//!
//!  - [`files`]: mod files by version id. Each version contributes its primary
//!    file; where it is installed is the caller's choice, file by file.
//!  - [`modpack`]: a `.mrpack`. Its index says which loader the pack runs on,
//!    which files to fetch, and carries a directory of overrides.
//!
//! Neither needs a token: Modrinth's API is open and its files are public CDN
//! links.
//!
//! What is deliberately not here is the loader. A modpack resolves to a
//! [`LoaderSpec`] and stops; standing that loader up is the caller's, because
//! it means running another plugin and plugins are driven from the host.
//!
//! Build-time only: the requests go through `opys-dev`'s blocking GET, which
//! the runtime never links.
//!
//! [`LoaderSpec`]: opys_modpack::LoaderSpec

mod error;
mod files;
mod modpack;
mod reference;

/// Modrinth's API. Overridable per call, as every resolver's base is.
pub const MODRINTH_API: &str = "https://api.modrinth.com/v2";

pub use error::ModrinthError;
pub use files::{file_artifacts, resolve_modrinth_files, ModrinthFile};
pub use modpack::{
    loader_spec, resolve_modrinth_modpack, MrpackEnv, MrpackFile, MrpackHashes, MrpackIndex,
    MrpackSide, ResolvedModpack,
};
pub use opys_modpack::LoaderSpec;
pub use reference::{parse_modpack_ref, parse_version_ref, ModpackRef};
