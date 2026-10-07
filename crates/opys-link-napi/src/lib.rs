//! napi-rs bindings for `opys-link`.
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
use opys_link::{LinkOptions, ResolvedFile};
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

pub struct Resolve {
    links: Vec<String>,
    options: LinkOptions,
}

impl Task for Resolve {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        to_json(&opys_link::resolve_links(&self.links, &self.options).map_err(map_err)?)
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Json) -> Result<Unknown> {
        env.to_js_value(&output)
    }
}

/// Resolve links to pinned files, in the order given —
/// `{ link, provider, filename, url, size, integrity? }[]`.
#[napi(js_name = "resolveLinks", ts_return_type = "Promise<Json>")]
pub fn resolve_links(links: Vec<String>, options: Json) -> Result<AsyncTask<Resolve>> {
    Ok(AsyncTask::new(Resolve {
        links,
        options: from_json(options)?,
    }))
}

/// Turn resolved files into artifacts, each at the path chosen for it. The
/// paths come from the config author's callback, which only the host can run.
#[napi(js_name = "linkFileArtifacts")]
pub fn link_file_artifacts(files: Json, paths: Vec<String>) -> Result<Json> {
    let files: Vec<ResolvedFile> = from_json(files)?;
    to_json(&opys_link::file_artifacts(&files, &paths).map_err(map_err)?)
}
