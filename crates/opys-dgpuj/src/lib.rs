//! `opys-dgpuj` — the [dgpuj] launcher, from its GitHub releases.
//!
//! dgpuj forces the discrete GPU on hybrid-graphics machines and then is the
//! `java` it was given, so it goes in front of a launch line as its command.
//! It is published as one archive per build target; this crate turns a
//! release into those archives — each scoped to its OS and architecture and
//! unpacking the one binary — plus the vars that point at it.
//!
//! The release is the one this crate names, unless a config names another:
//! see [`DGPUJ_VERSION`]. Build-time only: a release that is looked up is
//! asked for through `opys-dev`'s blocking client, which the runtime never
//! links.
//!
//! [dgpuj]: https://github.com/harmoniya-net/dgpuj

mod error;
mod release;
mod template;

pub use error::DgpujError;
pub use release::DGPUJ_VERSION;
pub use template::{
    build_dgpuj, default_platforms, resolve_dgpuj, DgpujBuild, DgpujOptions, DgpujPlatform,
    DgpujTemplate, DEFAULT_REPO, PLUGIN_NAME,
};
