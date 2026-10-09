//! The `lwjgl3ify` namespace: `opys-lwjgl3ify`, as JS sees it.
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
use opys_lwjgl3ify::Lwjgl3ifyOptions;
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
    Resolve(Box<Lwjgl3ifyOptions>),
    Build(Box<Lwjgl3ifyOptions>),
    Version { input: String, source: String },
}

impl Task for Fetch {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        match self {
            Fetch::Resolve(options) => {
                to_json(&opys_lwjgl3ify::resolve_lwjgl3ify(options).map_err(map_err)?)
            }
            Fetch::Build(options) => {
                to_json(&opys_lwjgl3ify::build_lwjgl3ify(options).map_err(map_err)?)
            }
            Fetch::Version { input, source } => {
                to_json(&opys_lwjgl3ify::resolve_lwjgl3ify_version(input, source).map_err(map_err)?)
            }
        }
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Json) -> Result<Unknown> {
        env.to_js_value(&output)
    }
}

/// Resolve lwjgl3ify into `{ artifacts, vars, classpath, launch, jvmArgs,
/// mainClass, gameArgs }` — the release's published version document, mapped
/// the way a vanilla one is, with the jars for `mods/` added to `artifacts`.
#[napi(
    namespace = "lwjgl3ify",
    js_name = "resolveLwjgl3ify",
    ts_return_type = "Promise<Json>"
)]
pub fn resolve_lwjgl3ify(options: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Resolve(Box::new(from_json(
        options,
    )?))))
}

/// Run the `lwjgl3ify` plugin: the same resolve, returned as the contribution
/// to merge — `{ name, contribution }`.
#[napi(
    namespace = "lwjgl3ify",
    js_name = "buildLwjgl3ify",
    ts_return_type = "Promise<Json>"
)]
pub fn build_lwjgl3ify(options: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Build(Box::new(from_json(options)?))))
}

/// Resolve a Minecraft version, an alias or a release tag to `{ minecraft,
/// lwjgl3ify, documentUrl }`.
#[napi(
    namespace = "lwjgl3ify",
    js_name = "resolveLwjgl3ifyVersion",
    ts_return_type = "Promise<Json>"
)]
pub fn resolve_lwjgl3ify_version(input: String, source: String) -> AsyncTask<Fetch> {
    AsyncTask::new(Fetch::Version { input, source })
}

/// The canonical document index base URL.
#[napi(namespace = "lwjgl3ify", js_name = "defaultLwjgl3ifyIndex")]
pub fn default_lwjgl3ify_index() -> &'static str {
    opys_lwjgl3ify::DEFAULT_LWJGL3IFY_INDEX
}
