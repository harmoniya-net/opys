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

mod contribution;
mod engine;

pub use contribution::{Contribution, LaunchFragment, LaunchGroups, PluginOutput};
pub use engine::{assemble, Assembled, ManifestConfig};
