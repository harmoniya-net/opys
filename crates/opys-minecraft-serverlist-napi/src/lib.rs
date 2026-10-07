//! napi-rs bindings for `opys-minecraft-serverlist`.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use opys_minecraft_serverlist::{ServerEntry, ServerlistOptions};
use serde_json::Value as Json;

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

/// Run the `serverlist` plugin: `{ name, contribution }`, the contribution
/// holding one generated `servers.dat` per distinct ruleset and its blob.
#[napi(js_name = "buildServerlist")]
pub fn build_serverlist(servers: Json, options: Json) -> Result<Json> {
    let servers: Vec<ServerEntry> = serde_json::from_value(servers).map_err(map_err)?;
    let options: ServerlistOptions = serde_json::from_value(options).map_err(map_err)?;
    let output = opys_minecraft_serverlist::build_serverlist(&servers, &options);
    serde_json::to_value(output).map_err(map_err)
}

/// Where the list goes unless a config says otherwise.
#[napi(js_name = "defaultServerlistPath")]
pub fn default_serverlist_path() -> String {
    opys_minecraft_serverlist::DEFAULT_SERVERLIST_PATH.to_owned()
}
