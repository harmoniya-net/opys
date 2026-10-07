//! `opys-authliberty` — AuthLiberty, a `-javaagent` that points Minecraft's
//! auth, account, session and services hosts somewhere else.
//!
//! It is not a loader: it has no main class and no classpath, and it composes
//! with whichever loader is in the config by contributing one jar and a few
//! JVM arguments ahead of the loader's own.
//!
//! The jar is published to a GitLab generic package registry, so resolving a
//! version is two calls to GitLab's packages API — the package, then its
//! files, where the sha256 is.
//!
//! Build-time only: the requests go through `opys-dev`'s one-shot blocking
//! GET, which the runtime never links.

mod error;
mod resolver;
mod template;

pub use error::AuthLibertyError;
pub use resolver::{
    resolve_authliberty_version, AuthLibertyRelease, ResolveAuthLibertyOptions, DEFAULT_GITLAB,
    DEFAULT_PROJECT,
};
pub use template::{
    build_authliberty, resolve_authliberty, AuthLibertyHosts, AuthLibertyOptions,
    AuthLibertyTemplate, PLUGIN_NAME,
};
