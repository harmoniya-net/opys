//! `opys-cleanroom` — the Cleanroom loader, a Minecraft 1.12.2 Forge successor.
//!
//! Cleanroom resolves through a published index of version documents, the same
//! way `opys-forge` and `opys-neoforge` do, and this crate keeps their file
//! names. What differs is the document. Cleanroom's installer has never run a
//! processor: all it does is unpack one jar, and that jar is a release asset
//! in its own right. So a Cleanroom document needs neither the installer nor
//! horno, and is published as a **complete** version JSON rather than an
//! `inheritsFrom` patch — which is also what Cleanroom itself ships from
//! 0.5.16-alpha on.
//!
//! So there is no fold here. The document is read as a [`Client`], exactly as
//! a vanilla version JSON is, and handed to `opys-minecraft-vanilla`'s mappers.
//! Nothing in this crate knows which vanilla libraries Cleanroom replaces; the
//! document already lists what runs.
//!
//! Build-time only: the requests go through `opys-dev`'s one-shot blocking
//! GET, which the runtime never links.
//!
//! [`Client`]: opys_mojang::Client

mod error;
mod index;
mod template;

pub use error::CleanroomError;
pub use index::{resolve_cleanroom_version, CleanroomRelease, DEFAULT_CLEANROOM_INDEX};
pub use template::{
    build_cleanroom, fetch_document, resolve_cleanroom, CleanroomOptions, CleanroomTemplate,
    PLUGIN_NAME,
};
