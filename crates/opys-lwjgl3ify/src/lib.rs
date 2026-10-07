//! `opys-lwjgl3ify` — lwjgl3ify, Forge 1.7.10 on LWJGL 3 and a current JVM.
//!
//! Two halves, and they come from two places.
//!
//! The **version** resolves through a published index of documents, the way
//! the rest of the family does. lwjgl3ify has no installer: each release ships
//! a complete version JSON, and the index republishes it with its libraries
//! made installable. So, as in `opys-cleanroom`, the document is read as a
//! [`Client`] and mapped the way a vanilla one is — no fold, no horno.
//!
//! The **mod** does not. lwjgl3ify is also a jar that has to sit in `mods/`,
//! where RetroFuturaBootstrap looks for its plugin, and it needs UniMixins
//! beside it. A version JSON has no way to say "put this in `mods/`", so
//! neither is in the document, and [`mods`] reads both off GitHub Releases.
//! That is the only reason this crate is not a copy of `opys-cleanroom`.
//!
//! Build-time only: the requests go through `opys-dev`'s one-shot blocking
//! GET, which the runtime never links.
//!
//! [`Client`]: opys_mojang::Client

mod error;
mod index;
mod mods;
mod template;

pub use error::Lwjgl3ifyError;
pub use index::{resolve_lwjgl3ify_version, Lwjgl3ifyRelease, DEFAULT_LWJGL3IFY_INDEX};
pub use mods::{
    mod_artifact, mod_jar, unimixins_jar, Unimixins, UnimixinsOptions, DEFAULT_LWJGL3IFY_REPO,
    DEFAULT_UNIMIXINS_REPO,
};
pub use template::{
    build_lwjgl3ify, fetch_document, resolve_lwjgl3ify, Lwjgl3ifyOptions, Lwjgl3ifyTemplate,
    PLUGIN_NAME,
};
