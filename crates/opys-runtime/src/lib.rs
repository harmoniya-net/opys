//! `@opys/runtime` port — install + launch executor.
//!
//! Depends on `opys-core` only among opys crates (mirrors the JS invariant).

mod archive;
mod constants;
mod errors;
mod fetch;
mod install;
mod launch;
mod pathnorm;
mod platform;
mod tar_reader;

mod phases {
    pub mod extract;
    pub mod fetch;
    pub mod resolve;
    pub mod resolve_discovery;
    pub mod resolve_pointers;
    pub mod scan;
    pub mod sweep;
    pub mod verify;
}

pub use constants::DEFAULT_CONCURRENCY;
pub use errors::InstallError;
pub use install::{install, InstallOptions, InstallProgress};
/// Re-exported so callers can drive [`InstallOptions::cancel`] without depending
/// on `tokio-util` directly.
pub use tokio_util::sync::CancellationToken;
pub use launch::{build_launch, launch, LaunchOptions, LaunchSpec};
pub use phases::resolve::{resolve_manifest, ManifestSource};
pub use platform::current_platform;
