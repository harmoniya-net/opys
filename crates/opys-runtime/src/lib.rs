//! `@opys/runtime` port — install + launch executor.
//!
//! Depends on `opys-core` and `opys-bundle` alone among opys crates.

mod archive;
mod blobs;
mod constants;
mod errors;
mod fetch;
mod head;
mod install;
mod launch;
mod pathnorm;
mod platform;
mod root;

mod phases {
    pub mod cleanup;
    pub mod extract;
    pub mod fetch;
    pub mod resolve;
    pub mod scan;
    pub mod verify;
}

pub use constants::DEFAULT_CONCURRENCY;
pub use errors::{ErrorReport, InstallError};
pub use head::read_head;
pub use install::{install, InstallOptions, InstallProgress};
pub use launch::{build_launch, launch, prepare, LaunchOptions, LaunchSpec};
pub use phases::resolve::{resolve_manifest, ManifestSource};
pub use platform::current_platform;
pub use root::ROOT_VAR;
/// Re-exported so callers can drive [`InstallOptions::cancel`] without depending
/// on `tokio-util` directly.
pub use tokio_util::sync::CancellationToken;
