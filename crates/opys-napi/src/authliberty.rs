//! The `authliberty` namespace: `opys-authliberty`, as JS sees it.
//!
//! One addon per crate, matching the rest of the family: a binding is
//! packaging, and a package that names its own module is what keeps the crate
//! split legible. Collapsing addons is a separate decision, taken for all of
//! them at once rather than crate by crate.
//!
//! JSON crosses the boundary as `serde_json::Value`; every domain type decodes
//! and encodes itself, so nothing is mirrored here.
//!
//! Anything that touches the network is an `AsyncTask`: these calls block, and
//! `opys build` runs its plugins concurrently, so running them on the libuv
//! pool is what keeps that concurrency real.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use opys_authliberty::{AuthLibertyOptions, ResolveAuthLibertyOptions};
use serde_json::Value as Json;

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

fn to_json<T: serde::Serialize>(value: &T) -> Result<Json> {
    serde_json::to_value(value).map_err(map_err)
}

fn from_json<T: serde::de::DeserializeOwned>(raw: Json) -> Result<T> {
    serde_json::from_value(raw).map_err(map_err)
}

// ──────────────────────────────────────────────────────────────────────────
// Network — one variant per entry point, each with its own typed input.
// ──────────────────────────────────────────────────────────────────────────

pub enum Fetch {
    Resolve(Box<AuthLibertyOptions>),
    Build(Box<AuthLibertyOptions>),
    Version(String, ResolveAuthLibertyOptions),
}

impl Task for Fetch {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        match self {
            Fetch::Resolve(options) => {
                to_json(&opys_authliberty::resolve_authliberty(options).map_err(map_err)?)
            }
            Fetch::Build(options) => {
                to_json(&opys_authliberty::build_authliberty(options).map_err(map_err)?)
            }
            Fetch::Version(version, options) => to_json(
                &opys_authliberty::resolve_authliberty_version(version, options)
                    .map_err(map_err)?,
            ),
        }
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Json) -> Result<Unknown> {
        env.to_js_value(&output)
    }
}

/// Resolve AuthLiberty into `{ artifacts, jvmArgs, release }` — the agent jar
/// and the JVM arguments that load it.
#[napi(
    namespace = "authliberty",
    js_name = "resolveAuthliberty",
    ts_return_type = "Promise<Json>"
)]
pub fn resolve_authliberty(options: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Resolve(Box::new(from_json(
        options,
    )?))))
}

/// Run the `authliberty` plugin: the same resolve, returned as the
/// contribution to merge — `{ name, contribution }`.
#[napi(
    namespace = "authliberty",
    js_name = "buildAuthliberty",
    ts_return_type = "Promise<Json>"
)]
pub fn build_authliberty(options: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Build(Box::new(from_json(options)?))))
}

/// Resolve a version, or `latest`, to `{ version, filename, url, size,
/// sha256?, createdAt }` against the GitLab package registry.
#[napi(
    namespace = "authliberty",
    js_name = "resolveAuthLibertyVersion",
    ts_return_type = "Promise<Json>"
)]
pub fn resolve_authliberty_version(version: String, options: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Version(version, from_json(options)?)))
}
