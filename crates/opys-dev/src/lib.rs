//! `opys-dev` — the build-time SDK.
//!
//! Build-time only, by design: `opys-core` carries the contracts both sides of
//! the build/runtime wall share, so a type only one side ever names — such as
//! [`Contribution`] — belongs here instead.
//!
//! This crate holds the part of the build that is data in, data out. Driving
//! the plugins is left to the caller, because that half is host-shaped: the JS
//! SDK runs author closures, while a native builder runs Rust plugins. Both
//! then hand their contributions to [`assemble`], so the manifest is folded
//! exactly one way regardless of who produced it.
//!
//! It also carries the two pieces of plumbing every build-time resolver needs
//! and the runtime must never inherit: a one-shot blocking HTTP GET, and the
//! GitHub Releases listing several loaders resolve against. Retry, resume and
//! download bookkeeping are the runtime's job and stay in `opys-runtime`.

mod contribution;
mod engine;
#[cfg(feature = "net")]
pub mod github;
#[cfg(feature = "net")]
pub mod http;

pub use contribution::{Contribution, LaunchFragment, LaunchGroups, PluginOutput};
pub use engine::{assemble, Assembled, ManifestConfig};
#[cfg(feature = "net")]
pub use http::{HttpError, HttpResponse, OPYS_USER_AGENT};
