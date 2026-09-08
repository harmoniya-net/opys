//! napi-rs bindings for `opys-dev`.
//!
//! JSON crosses the boundary as `serde_json::Value`. Note what is absent: no
//! wire type is named here, and no JS-shaped mirror of a domain type either.
//! `PluginOutput` and `ManifestConfig` decode themselves, so this file says
//! only which call goes where.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use opys_dev::{ManifestConfig, PluginOutput};
use serde_json::Value as Json;

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

/// Merge plugin contributions and the author's manifest config into a
/// manifest. Returns `{ manifest, warnings }` — warnings are returned rather
/// than logged so the engine stays pure and JS keeps its own log channel.
///
/// A contribution's `launch` groups are ignored here even when present: the
/// caller resolves them through the author's accessors before calling in, and
/// hands the result over as `args` / `command`.
#[napi(js_name = "assemble")]
pub fn assemble(outputs: Json, config: Json) -> Result<Json> {
    let outputs: Vec<PluginOutput> = serde_json::from_value(outputs).map_err(map_err)?;
    let config: ManifestConfig = serde_json::from_value(config).map_err(map_err)?;

    let assembled = opys_dev::assemble(&outputs, &config);

    Ok(serde_json::json!({
        "manifest": serde_json::to_value(&assembled.manifest).map_err(map_err)?,
        "warnings": assembled.warnings,
    }))
}
