//! `opys-forge` — the Forge loader.
//!
//! Forge resolves through a published index of version documents: every build
//! that has ever shipped, from the 1.1 jar mods to the current processor
//! installs, generated once as an ordinary Mojang `inheritsFrom` document and
//! served as a static file. So this crate reads an index entry, reads the
//! document it names, and hands both to `opys-minecraft-vanilla`'s fold — the
//! same one every loader in the family uses.
//!
//! What used to be here is why that matters. Forge installs in four eras, and
//! a loader that resolves them at build time has to know all four: run an
//! installer's processors, or read a version JSON out of it, or overlay a zip
//! of class files onto a signed client jar. The documents answer all of that
//! ahead of time, so nothing downstream branches on an era — which is exactly
//! the position Fabric has always been in, and why the two now have the same
//! shape.
//!
//! Build-time only: the requests go through `opys-dev`'s one-shot blocking
//! GET, which the runtime never links.

mod error;
mod index;
mod template;

pub use error::ForgeError;
pub use index::{resolve_forge_version, ForgeRelease, DEFAULT_FORGE_INDEX};
pub use template::{
    build_forge, fetch_document, resolve_forge, ForgeOptions, ForgeTemplate, PLUGIN_NAME,
};
