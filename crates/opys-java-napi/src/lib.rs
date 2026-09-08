//! napi-rs bindings for `opys-java`.
//!
//! JSON crosses the boundary as `serde_json::Value`; the option and result
//! types decode and encode themselves, so nothing is mirrored here.
//!
//! Every resolve is an `AsyncTask`. These calls block on the network, and
//! `opys build` runs its plugins concurrently — running them on the libuv
//! pool is what keeps that concurrency real instead of serialising the whole
//! build behind one JS thread.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use opys_java::{
    JavaOptions, ResolveGraalvmOptions, ResolveTemurinOptions, ResolveZuluOptions,
    DEFAULT_PLATFORMS,
};
use serde_json::Value as Json;

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

fn to_json<T: serde::Serialize>(value: &T) -> Result<Json> {
    serde_json::to_value(value).map_err(map_err)
}

/// A resolve waiting to run on the thread pool. One variant per entry point,
/// so each keeps its own typed options rather than a stringly-tagged bag.
pub enum Resolve {
    Java(JavaOptions),
    Build(JavaOptions),
    Temurin(String, ResolveTemurinOptions),
    Zulu(String, ResolveZuluOptions),
    Graalvm(String, ResolveGraalvmOptions),
}

impl Task for Resolve {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        match self {
            Resolve::Java(options) => to_json(&opys_java::resolve_java(options).map_err(map_err)?),
            Resolve::Build(options) => {
                let build = opys_java::build_java(options).map_err(map_err)?;
                Ok(serde_json::json!({
                    "output": to_json(&build.output)?,
                    "release": to_json(&build.release)?,
                }))
            }
            Resolve::Temurin(version, options) => {
                to_json(&opys_java::resolve_temurin(version, options).map_err(map_err)?)
            }
            Resolve::Zulu(version, options) => {
                to_json(&opys_java::resolve_zulu(version, options).map_err(map_err)?)
            }
            Resolve::Graalvm(version, options) => {
                to_json(&opys_java::resolve_graalvm(version, options).map_err(map_err)?)
            }
        }
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Json) -> Result<Unknown> {
        env.to_js_value(&output)
    }
}

fn options<T: serde::de::DeserializeOwned + Default>(raw: Option<Json>) -> Result<T> {
    match raw {
        None | Some(Json::Null) => Ok(T::default()),
        Some(raw) => serde_json::from_value(raw).map_err(map_err),
    }
}

/// The (OS, arch) pairs every vendor resolver targets by default.
#[napi(js_name = "defaultPlatforms")]
pub fn default_platforms() -> Result<Json> {
    to_json(&DEFAULT_PLATFORMS)
}

/// Resolve a JDK and build the manifest fragment that installs it —
/// `{ artifacts, vars, release }`.
#[napi(js_name = "resolveJava", ts_return_type = "Promise<Json>")]
pub fn resolve_java(options: Json) -> Result<AsyncTask<Resolve>> {
    let options: JavaOptions = serde_json::from_value(options).map_err(map_err)?;
    Ok(AsyncTask::new(Resolve::Java(options)))
}

/// Run the `java` plugin: the same resolve, returned as the contribution to
/// merge — `{ output, release }`.
#[napi(js_name = "buildJava", ts_return_type = "Promise<Json>")]
pub fn build_java(options: Json) -> Result<AsyncTask<Resolve>> {
    let options: JavaOptions = serde_json::from_value(options).map_err(map_err)?;
    Ok(AsyncTask::new(Resolve::Build(options)))
}

/// Resolve an Eclipse Temurin release across the requested platforms.
#[napi(js_name = "resolveTemurin", ts_return_type = "Promise<Json>")]
pub fn resolve_temurin(version: String, opts: Option<Json>) -> Result<AsyncTask<Resolve>> {
    Ok(AsyncTask::new(Resolve::Temurin(version, options(opts)?)))
}

/// Resolve an Azul Zulu release across the requested platforms.
#[napi(js_name = "resolveZulu", ts_return_type = "Promise<Json>")]
pub fn resolve_zulu(version: String, opts: Option<Json>) -> Result<AsyncTask<Resolve>> {
    Ok(AsyncTask::new(Resolve::Zulu(version, options(opts)?)))
}

/// Resolve a GraalVM CE release across the requested platforms.
#[napi(js_name = "resolveGraalvm", ts_return_type = "Promise<Json>")]
pub fn resolve_graalvm(version: String, opts: Option<Json>) -> Result<AsyncTask<Resolve>> {
    Ok(AsyncTask::new(Resolve::Graalvm(version, options(opts)?)))
}
