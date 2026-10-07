//! `opys-dgpuj` — the [dgpuj] launcher, from its GitHub releases.
//!
//! dgpuj forces the discrete GPU on hybrid-graphics machines and then runs the
//! JVM in-process, so it stands in for `java` as the launch command. It is
//! published as one archive per build target; this crate resolves a release
//! into those archives — each scoped to its OS and architecture and unpacking
//! the one binary — plus the vars that point at it.
//!
//! Build-time only: the requests go through `opys-dev`'s blocking client,
//! which the runtime never links.
//!
//! [dgpuj]: https://github.com/harmoniya-net/dgpuj

mod error;
mod template;

pub use error::DgpujError;
pub use template::{
    build_dgpuj, default_platforms, resolve_dgpuj, DgpujBuild, DgpujOptions, DgpujPlatform,
    DgpujTemplate, DEFAULT_REPO, PLUGIN_NAME,
};
