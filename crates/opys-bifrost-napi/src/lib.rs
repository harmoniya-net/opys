//! napi-rs bindings for `opys-bifrost`.
//!
//! One synchronous call. A token is minted inside `runClient`, which is a
//! plain function the launch calls on its way through, and signing is
//! microseconds — there is nothing to wait for.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::Value as Json;

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

/// Mint a Bifrost token: `{ username, uuid, token }`.
#[napi(js_name = "mintBifrost")]
pub fn mint_bifrost(options: Json) -> Result<Json> {
    let options = serde_json::from_value(options).map_err(map_err)?;
    let auth = opys_bifrost::mint_bifrost(&options).map_err(map_err)?;
    serde_json::to_value(auth).map_err(map_err)
}

/// How long a token lives when no lifetime is given, in seconds.
#[napi(js_name = "defaultBifrostTtl")]
pub fn default_bifrost_ttl() -> u32 {
    opys_bifrost::DEFAULT_TTL_SECONDS as u32
}
