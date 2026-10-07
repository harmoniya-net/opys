//! napi-rs bindings for `opys-cleanroom`.
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

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use opys_cleanroom::CleanroomOptions;
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
    Resolve(Box<CleanroomOptions>),
    Build(Box<CleanroomOptions>),
    Version { input: String, source: String },
}

impl Task for Fetch {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        match self {
            Fetch::Resolve(options) => {
                to_json(&opys_cleanroom::resolve_cleanroom(options).map_err(map_err)?)
            }
            Fetch::Build(options) => {
                to_json(&opys_cleanroom::build_cleanroom(options).map_err(map_err)?)
            }
            Fetch::Version { input, source } => {
                to_json(&opys_cleanroom::resolve_cleanroom_version(input, source).map_err(map_err)?)
            }
        }
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Json) -> Result<Unknown> {
        env.to_js_value(&output)
    }
}

/// Resolve Cleanroom into `{ artifacts, vars, classpath, launch, jvmArgs,
/// mainClass, gameArgs }` — the release's published version document, mapped
/// the way a vanilla one is.
#[napi(js_name = "resolveCleanroom", ts_return_type = "Promise<Json>")]
pub fn resolve_cleanroom(options: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Resolve(Box::new(from_json(
        options,
    )?))))
}

/// Run the `cleanroom` plugin: the same resolve, returned as the contribution
/// to merge — `{ name, contribution }`.
#[napi(js_name = "buildCleanroom", ts_return_type = "Promise<Json>")]
pub fn build_cleanroom(options: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Build(Box::new(from_json(options)?))))
}

/// Resolve a Minecraft version, an alias or a release tag to `{ minecraft,
/// cleanroom, documentUrl }`.
#[napi(js_name = "resolveCleanroomVersion", ts_return_type = "Promise<Json>")]
pub fn resolve_cleanroom_version(input: String, source: String) -> AsyncTask<Fetch> {
    AsyncTask::new(Fetch::Version { input, source })
}

/// The canonical document index base URL.
#[napi(js_name = "defaultCleanroomIndex")]
pub fn default_cleanroom_index() -> &'static str {
    opys_cleanroom::DEFAULT_CLEANROOM_INDEX
}
