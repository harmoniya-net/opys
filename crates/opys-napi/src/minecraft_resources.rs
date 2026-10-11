//! The `minecraftResources` namespace: `opys-minecraft-resources`, as JS
//! sees it.
//!
//! JSON crosses the boundary as `serde_json::Value`; the options and the
//! file decode themselves, so nothing is mirrored here.
//!
//! Decoding a file is synchronous, and reading one is too: a config reads
//! its resources while it is being loaded. Everything else touches
//! the network and so is an `AsyncTask`: the calls block, and `opys build`
//! runs its plugins concurrently, so running them on the libuv pool is what
//! keeps that concurrency real.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use opys_minecraft_resources::ResourcesOptions;
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

pub enum Ask {
    Resolve(Box<ResourcesOptions>),
    Build(Box<ResourcesOptions>),
}

impl Task for Ask {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        use opys_minecraft_resources as resources;
        match self {
            Ask::Resolve(options) => to_json(
                &resources::resolve_resources(
                    &options.resources,
                    options.side,
                    &options.base,
                    &options.links,
                )
                .map_err(map_err)?,
            ),
            Ask::Build(options) => to_json(&resources::build_resources(options).map_err(map_err)?),
        }
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Json) -> Result<Unknown> {
        env.to_js_value(&output)
    }
}

/// Decode a resources file from its text. `path` is what an error calls it.
#[napi(
    namespace = "minecraftResources",
    js_name = "parseResources",
    ts_return_type = "Json"
)]
pub fn parse_resources(text: String, path: Option<String>) -> Result<Json> {
    let path = path.as_deref().unwrap_or("resources.toml");
    let file = opys_minecraft_resources::parse_resources(&text, path).map_err(map_err)?;
    to_json(&file)
}

/// Read and decode a resources file.
#[napi(
    namespace = "minecraftResources",
    js_name = "readResources",
    ts_return_type = "Json"
)]
pub fn read_resources(path: String) -> Result<Json> {
    let file =
        opys_minecraft_resources::read_resources(std::path::Path::new(&path)).map_err(map_err)?;
    to_json(&file)
}

/// One side of a file, resolved: a file per entry, in the order written.
#[napi(
    namespace = "minecraftResources",
    js_name = "resolveResources",
    ts_return_type = "Promise<Json>"
)]
pub fn resolve_resources(options: Json) -> Result<AsyncTask<Ask>> {
    Ok(AsyncTask::new(Ask::Resolve(Box::new(from_json(options)?))))
}

/// Run the `resources` plugin: `{ name, contribution }`.
#[napi(
    namespace = "minecraftResources",
    js_name = "buildResources",
    ts_return_type = "Promise<Json>"
)]
pub fn build_resources(options: Json) -> Result<AsyncTask<Ask>> {
    Ok(AsyncTask::new(Ask::Build(Box::new(from_json(options)?))))
}
