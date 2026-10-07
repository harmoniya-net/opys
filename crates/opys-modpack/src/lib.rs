//! `opys-modpack` — what the modpack resolvers have in common.
//!
//! A Modrinth `.mrpack` and a CurseForge modpack `.zip` are different formats
//! saying the same three things: which loader the pack runs on, which files
//! to fetch, and a directory of overrides to unpack over the instance. The
//! file lists are each format's own business. The other two are not, and
//! live here so `opys-modrinth` and `opys-curseforge` cannot drift apart on
//! them:
//!
//!  - [`LoaderSpec`] — the loader a pack asks for, in the terms opys's own
//!    loader plugins take.
//!  - [`PackArchive`] — the downloaded archive: an entry read out of it, and
//!    the artifact that has the runtime fetch it again and unpack its
//!    overrides.
//!
//! This crate has no binding of its own. It is a library the two resolvers
//! link, and it never touches the network.

mod archive;
mod loader;

pub use archive::{ArchiveError, PackArchive};
pub use loader::LoaderSpec;
