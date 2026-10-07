//! napi-rs bindings for `opys-dgpuj`.
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
use opys_dgpuj::DgpujOptions;
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

pub enum Fetch {
    Resolve(Box<DgpujOptions>),
    Build(Box<DgpujOptions>),
}

impl Task for Fetch {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        match self {
            Fetch::Resolve(options) => {
                to_json(&opys_dgpuj::resolve_dgpuj(options).map_err(map_err)?)
            }
            Fetch::Build(options) => to_json(&opys_dgpuj::build_dgpuj(options).map_err(map_err)?),
        }
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Json) -> Result<Unknown> {
        env.to_js_value(&output)
    }
}

/// Resolve dgpuj into `{ artifacts, vars, release }` — one archive per
/// target, the vars that find the binary, and the release they came from.
#[napi(js_name = "resolveDgpuj", ts_return_type = "Promise<Json>")]
pub fn resolve_dgpuj(options: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Resolve(Box::new(from_json(
        options,
    )?))))
}

/// Run the `dgpuj` plugin: `{ output: { name, contribution }, release }`.
#[napi(js_name = "buildDgpuj", ts_return_type = "Promise<Json>")]
pub fn build_dgpuj(options: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Build(Box::new(from_json(options)?))))
}

/// dgpuj's published targets.
#[napi(js_name = "defaultDgpujPlatforms")]
pub fn default_dgpuj_platforms() -> Result<Json> {
    to_json(&opys_dgpuj::default_platforms())
}

/// Where dgpuj's releases are published.
#[napi(js_name = "defaultDgpujRepo")]
pub fn default_dgpuj_repo() -> &'static str {
    opys_dgpuj::DEFAULT_REPO
}
