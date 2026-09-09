//! `opys-neoforge` — the NeoForge loader.
//!
//! NeoForge resolves through a published index of version documents: every
//! build it has shipped, generated once from its installer as an ordinary
//! Mojang `inheritsFrom` document and served as a static file. So this crate
//! reads an index entry, reads the document it names, and hands both to
//! `opys-minecraft-vanilla`'s fold — the same one every loader in the family
//! uses.
//!
//! It is deliberately the same shape as `opys-forge`, down to the file names,
//! and deliberately not the same crate. What the two share is our publication
//! format, not anything of Forge's: NeoForge is a separate loader with a
//! separate maven, a separate versioning scheme that has already changed once,
//! and no promotions endpoint at all.
//!
//! Build-time only: the requests go through `opys-dev`'s one-shot blocking
//! GET, which the runtime never links.

mod error;
mod index;
mod template;

pub use error::NeoForgeError;
pub use index::{resolve_neoforge_version, NeoForgeRelease, DEFAULT_NEOFORGE_INDEX};
pub use template::{
    build_neoforge, fetch_document, resolve_neoforge, NeoForgeOptions, NeoForgeTemplate,
    PLUGIN_NAME,
};
