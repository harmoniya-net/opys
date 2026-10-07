//! `opys-curseforge` — CurseForge, two ways.
//!
//!  - [`files`]: mod files by file id. Where each is installed is the caller's
//!    choice, file by file.
//!  - [`modpack`]: a modpack `.zip`. Its manifest says which loader the pack
//!    runs on and which files it is made of, and carries a directory of
//!    overrides.
//!
//! Unlike Modrinth, everything here needs an API key: a file is only ever
//! found by id, through the authenticated API. The key is used at build time
//! and goes no further — the URLs it resolves to are public CDN links, so a
//! built manifest installs without one.
//!
//! As in `opys-modrinth`, the loader is not stood up here. A modpack resolves
//! to a [`LoaderSpec`] and stops.
//!
//! Build-time only: the requests go through `opys-dev`'s blocking client,
//! which the runtime never links.
//!
//! [`LoaderSpec`]: opys_modpack::LoaderSpec

mod error;
mod files;
mod modpack;
mod reference;

/// CurseForge's API. Overridable per call, as every resolver's base is.
pub const CURSEFORGE_API: &str = "https://api.curseforge.com/v1";

pub use error::CurseForgeError;
pub use files::{fetch_curseforge_files, file_artifacts, resolve_curseforge_files, CurseForgeFile};
pub use modpack::{
    loader_spec, resolve_curseforge_modpack, ManifestFile, ManifestMinecraft, ModLoader,
    ModpackManifest, ResolvedModpack,
};
pub use opys_modpack::LoaderSpec;
pub use reference::FileRef;
