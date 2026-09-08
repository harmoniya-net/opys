//! `opys-java` — JDK provisioning.
//!
//! Resolves a JDK from Eclipse Temurin, Azul Zulu or GraalVM CE and turns it
//! into the artifacts, vars and launch group a manifest needs. Build-time
//! only: every request goes through `opys-dev`'s one-shot blocking GET, which
//! the runtime never links.
//!
//! Each vendor resolver is a thin shell around pure functions — version
//! normalisation, query spelling, asset matching, anchoring — with the network
//! confined to a single call. The template that turns a resolved release into
//! a contribution is vendor-agnostic and entirely pure.

mod error;
mod graalvm;
mod platforms;
mod plugin;
mod template;
mod temurin;
mod url;
mod vendor;
mod version;
mod zulu;

pub use error::JavaError;
pub use graalvm::{resolve_graalvm, ResolveGraalvmOptions};
pub use platforms::{mac_home_suffix, Platform, SupportedArch, DEFAULT_PLATFORMS};
pub use plugin::{build_java, JavaBuild, PLUGIN_NAME};
pub use template::{java_template, resolve_java, JavaOptions, JavaTemplate, JavaVendor};
pub use temurin::{resolve_temurin, ResolveTemurinOptions, ADOPTIUM_BASE};
pub use vendor::{pick_anchor, VendorBinary, VendorRelease};
pub use zulu::{resolve_zulu, ResolveZuluOptions, ZULU_BASE};
