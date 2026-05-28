//! `@torba/runtime` port — install + launch executor.
//!
//! Depends on `torba-core` only among torba crates (mirrors the JS invariant).

mod archive;
mod constants;
mod errors;
mod fetch;
mod install;
mod launch;
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
pub use launch::{build_launch, launch, LaunchOptions, LaunchSpec};
pub use phases::resolve::{resolve_manifest, ManifestSource};
pub use platform::current_platform;
