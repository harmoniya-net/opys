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
/// manifest. Returns `{ manifest, blobs, warnings }` — warnings are returned rather
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
        "blobs": serde_json::to_value(&assembled.blobs).map_err(map_err)?,
        "warnings": assembled.warnings,
    }))
}

/// Walking a tree and hashing what is in it are both reads of the disk, so
/// they run off the main thread.
pub struct ScanDirectory(String);

impl Task for ScanDirectory {
    type Output = Vec<opys_dev::ScannedFile>;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Self::Output> {
        opys_dev::scan_directory(std::path::Path::new(&self.0)).map_err(map_err)
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Self::Output) -> Result<Self::JsValue> {
        env.to_js_value(&output)
    }
}

/// Every regular file under `directory`, in path order:
/// `{ rel, dir, filename, abs, size }[]`.
#[napi(js_name = "scanDirectory")]
pub fn scan_directory(directory: String) -> AsyncTask<ScanDirectory> {
    AsyncTask::new(ScanDirectory(directory))
}

pub struct ScannedFiles {
    files: Vec<opys_dev::PlacedFile>,
    hash: opys_dev::ScanHash,
}

impl Task for ScannedFiles {
    type Output = opys_dev::Contribution;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Self::Output> {
        opys_dev::scanned_files(&self.files, self.hash).map_err(map_err)
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Self::Output) -> Result<Self::JsValue> {
        env.to_js_value(&output)
    }
}

/// Hash the placed files — `{ abs, path, url? }[]` — and return the
/// contribution: a blob artifact for each file with no `url`, a pinned URL
/// artifact for each with one.
///
/// Placing is the caller's because it is the config author's: `path` and
/// `url` may be functions, and a function does not cross into here.
#[napi(js_name = "scannedFiles")]
pub fn scanned_files(files: Json, hash: Option<String>) -> Result<AsyncTask<ScannedFiles>> {
    Ok(AsyncTask::new(ScannedFiles {
        files: serde_json::from_value(files).map_err(map_err)?,
        hash: match hash {
            Some(hash) => serde_json::from_value(Json::String(hash)).map_err(map_err)?,
            None => opys_dev::ScanHash::default(),
        },
    }))
}
