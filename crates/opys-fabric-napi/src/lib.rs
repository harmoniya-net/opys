//! napi-rs bindings for `opys-fabric`.
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
use opys_fabric::FabricOptions;
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
    Resolve(Box<FabricOptions>),
    Build(Box<FabricOptions>),
    Version {
        game: String,
        meta: String,
        loader: Option<String>,
    },
}

impl Task for Fetch {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        match self {
            Fetch::Resolve(options) => {
                to_json(&opys_fabric::resolve_fabric(options).map_err(map_err)?)
            }
            Fetch::Build(options) => to_json(&opys_fabric::build_fabric(options).map_err(map_err)?),
            Fetch::Version { game, meta, loader } => to_json(
                &opys_fabric::resolve_fabric_version(game, meta, loader.as_deref())
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

/// Resolve Fabric into `{ artifacts, vars, classpath, launch, jvmArgs,
/// mainClass, gameArgs }` — the loader's libraries folded onto the vanilla
/// version its launcher profile inherits from.
#[napi(js_name = "resolveFabric", ts_return_type = "Promise<Json>")]
pub fn resolve_fabric(options: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Resolve(Box::new(from_json(
        options,
    )?))))
}

/// Run the `fabric` plugin: the same resolve, returned as the contribution to
/// merge — `{ name, contribution }`.
#[napi(js_name = "buildFabric", ts_return_type = "Promise<Json>")]
pub fn build_fabric(options: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Build(Box::new(from_json(options)?))))
}

/// Resolve a game version (and optional loader) to `{ gameVersion,
/// loaderVersion, profileUrl }`. A pinned loader needs no request.
#[napi(js_name = "resolveFabricVersion", ts_return_type = "Promise<Json>")]
pub fn resolve_fabric_version(
    game: String,
    meta: String,
    loader: Option<String>,
) -> AsyncTask<Fetch> {
    AsyncTask::new(Fetch::Version { game, meta, loader })
}

/// The canonical Fabric Meta base URL.
#[napi(js_name = "defaultFabricMeta")]
pub fn default_fabric_meta() -> &'static str {
    opys_fabric::DEFAULT_FABRIC_META
}
