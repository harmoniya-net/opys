//! The `minecraftServer` namespace: `opys-minecraft-server`, as JS sees it.
//!
//! JSON crosses the boundary as `serde_json::Value`; the options and the
//! core's name decode themselves, so nothing is mirrored here.
//!
//! Everything but the feature's name touches the network and so is an
//! `AsyncTask`: the calls block, and `opys build` runs its plugins
//! concurrently, so running them on the libuv pool is what keeps that
//! concurrency real.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use opys_minecraft_server::{Apis, Core, ServerOptions};
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

fn apis(raw: Option<Json>) -> Result<Apis> {
    raw.map(from_json)
        .transpose()
        .map(Option::unwrap_or_default)
}

pub enum Ask {
    Versions(Core, Apis),
    Builds(Core, String, Apis),
    Resolve(Box<ServerOptions>),
    Build(Box<ServerOptions>),
}

impl Task for Ask {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        use opys_minecraft_server as server;
        match self {
            Ask::Versions(core, apis) => {
                to_json(&server::list_versions(*core, apis).map_err(map_err)?)
            }
            Ask::Builds(core, version, apis) => {
                to_json(&server::list_builds(*core, version, apis).map_err(map_err)?)
            }
            Ask::Resolve(options) => to_json(&server::resolve_server(options).map_err(map_err)?),
            Ask::Build(options) => to_json(&server::build_server(options).map_err(map_err)?),
        }
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Json) -> Result<Unknown> {
        env.to_js_value(&output)
    }
}

/// The versions a core has a server for, newest first.
#[napi(
    namespace = "minecraftServer",
    js_name = "serverVersions",
    ts_return_type = "Promise<Json>"
)]
pub fn server_versions(core: Json, apis_raw: Option<Json>) -> Result<AsyncTask<Ask>> {
    Ok(AsyncTask::new(Ask::Versions(
        from_json(core)?,
        apis(apis_raw)?,
    )))
}

/// The builds a core has of one version, newest first.
#[napi(
    namespace = "minecraftServer",
    js_name = "serverBuilds",
    ts_return_type = "Promise<Json>"
)]
pub fn server_builds(
    core: Json,
    version: String,
    apis_raw: Option<Json>,
) -> Result<AsyncTask<Ask>> {
    Ok(AsyncTask::new(Ask::Builds(
        from_json(core)?,
        version,
        apis(apis_raw)?,
    )))
}

/// What a config resolves to: `{ pinned, label, files }`.
#[napi(
    namespace = "minecraftServer",
    js_name = "resolveServer",
    ts_return_type = "Promise<Json>"
)]
pub fn resolve_server(options: Json) -> Result<AsyncTask<Ask>> {
    Ok(AsyncTask::new(Ask::Resolve(Box::new(from_json(options)?))))
}

/// Run the `server` plugin: `{ output: { name, contribution }, label, pinned }`.
#[napi(
    namespace = "minecraftServer",
    js_name = "buildServer",
    ts_return_type = "Promise<Json>"
)]
pub fn build_server(options: Json) -> Result<AsyncTask<Ask>> {
    Ok(AsyncTask::new(Ask::Build(Box::new(from_json(options)?))))
}

/// The feature that has an install write `eula.txt`.
#[napi(namespace = "minecraftServer", js_name = "eulaFeature")]
pub fn eula_feature() -> &'static str {
    opys_minecraft_server::EULA_FEATURE
}
